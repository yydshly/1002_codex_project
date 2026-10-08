"""Loopback-only TripoSR task API; jobs run serially using the fixed local model."""
import hashlib,io,json,pathlib,queue,re,subprocess,sys,threading,time,uuid
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from PIL import Image
from publish_generated import publish

ROOT=pathlib.Path(__file__).resolve().parent
WEB=ROOT.parents[2]/"web"
OUTPUT=WEB/"assets"/"neural"/"local-jobs"
ORIGINS={"http://127.0.0.1:4196","http://localhost:4196"}
KINDS={"cabin","lighthouse","palm","boat"}
MAX_BYTES=8*1024*1024
TASKS={};LOCK=threading.RLock();QUEUE=queue.Queue(maxsize=8)
ACTIVE={"process":None,"taskId":None}
HEALTH={"provider":"Local GPU","model":"stabilityai/TripoSR","status":"checking","cold":True,"limits":{"imageBytes":MAX_BYTES,"maxDimension":8192},"input":"Transparent PNG or WebP; no automatic background removal"}
OUTPUT.mkdir(parents=True,exist_ok=True)

def now():
    from datetime import datetime,timezone
    return datetime.now(timezone.utc).isoformat()
def save_task(task):
    directory=OUTPUT/task["taskId"];directory.mkdir(parents=True,exist_ok=True)
    target=directory/"task.json";temporary=directory/"task.json.tmp"
    temporary.write_text(json.dumps(task,indent=2,ensure_ascii=False),encoding="utf-8");temporary.replace(target)
def change(task_id,**fields):
    with LOCK:
        TASKS[task_id].update(fields);save_task(TASKS[task_id])

def verify_backend():
    try:
        import torch,transformers,omegaconf,einops,trimesh,skimage,xatlas,moderngl
        import tsr.system
        if not torch.cuda.is_available(): raise RuntimeError("CUDA GPU is unavailable")
        torch.ones(1,device="cuda").cpu()
        context=moderngl.create_context(standalone=True);context.release()
        meta=json.loads((ROOT/"model-meta.json").read_text())
        expected=next(item["lfs"]["sha256"] for item in meta["siblings"] if item["rfilename"]=="model.ckpt")
        hash=hashlib.sha256()
        with (ROOT/"model-cache"/"TripoSR"/"model.ckpt").open("rb") as file:
            for chunk in iter(lambda:file.read(8*1024*1024),b""): hash.update(chunk)
        if hash.hexdigest()!=expected: raise RuntimeError("Official model checkpoint SHA256 failed")
        if not (ROOT/"model-cache"/"dino-vitb16"/"config.json").is_file(): raise RuntimeError("Local tokenizer configuration missing")
        HEALTH.update(status="ready",device=torch.cuda.get_device_name(0),modelRevision=meta["sha"],verifiedCheckpointSha256=expected)
    except Exception as error: HEALTH.update(status="unavailable",error=str(error))

sys.path.insert(0,str(ROOT/"upstream"/"TripoSR-main"))

def worker():
    while True:
        task_id=QUEUE.get()
        with LOCK: task=TASKS[task_id].copy()
        directory=OUTPUT/task_id
        change(task_id,status="running",stage="loading-model",startedAt=now())
        command=[sys.executable,str(ROOT/"local-generate.py"),str(directory/"input"/(task["kind"]+"-reference-v1.png")),"--output-dir",str(directory/"work"),"--resolution","256","--texture-resolution","1024","--max-faces","100000"]
        process=None;timed_out=threading.Event();lines=[]
        try:
            process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding="utf-8",errors="replace",shell=False,cwd=str(ROOT))
            with LOCK: ACTIVE.update(process=process,taskId=task_id)
            def timeout():
                if process.poll() is None:
                    timed_out.set();process.terminate()
            timer=threading.Timer(900,timeout);timer.daemon=True;timer.start()
            for line in process.stdout:
                lines.append(line.rstrip())
                try:
                    event=json.loads(line)
                    if isinstance(event,dict) and event.get("stage"): change(task_id,stage=event["stage"])
                except (ValueError,TypeError): pass
            code=process.wait();timer.cancel()
            (directory/"process-output.json").write_text(json.dumps(lines,indent=2,ensure_ascii=False),encoding="utf-8")
            if timed_out.is_set(): raise RuntimeError("Local inference exceeded the 15 minute safety timeout")
            log=directory/"work"/task["kind"]/"generation-log.json"
            if code!=0:
                error=json.loads(log.read_text()).get("failure",{}).get("message") if log.exists() else None
                raise RuntimeError(error or ("Local inference process failed: "+"\n".join(lines[-8:]))[:1600])
            prefix="/assets/neural/local-jobs/"+task_id
            result=publish(log,directory,task["kind"],prefix,task_id=task_id)
            change(task_id,status="succeeded",stage="complete",completedAt=now(),output=result)
        except Exception as error: change(task_id,status="failed",stage="failed",completedAt=now(),error=str(error)[:2000])
        finally:
            if process is not None and process.poll() is None: process.terminate();process.wait()
            with LOCK: ACTIVE.update(process=None,taskId=None)
            QUEUE.task_done()

class Handler(BaseHTTPRequestHandler):
    server_version="TidewaterLocal3D/1"
    def origin_ok(self): return self.headers.get("Origin") in ORIGINS
    def host_ok(self): return self.headers.get("Host") in {"127.0.0.1:4197","localhost:4197"}
    def respond(self,status,value):
        body=json.dumps(value,ensure_ascii=False).encode("utf-8");self.send_response(status)
        if self.origin_ok(): self.send_header("Access-Control-Allow-Origin",self.headers["Origin"]);self.send_header("Vary","Origin")
        self.send_header("Content-Type","application/json; charset=utf-8");self.send_header("Content-Length",str(len(body)));self.send_header("Cache-Control","no-store");self.end_headers();self.wfile.write(body)
    def do_OPTIONS(self):
        if not self.host_ok() or not self.origin_ok(): return self.respond(403,{"error":"Origin is not allowed"})
        self.send_response(204);self.send_header("Access-Control-Allow-Origin",self.headers["Origin"]);self.send_header("Access-Control-Allow-Methods","GET, POST, OPTIONS");self.send_header("Access-Control-Allow-Headers","Content-Type");self.send_header("Vary","Origin");self.send_header("Content-Length","0");self.end_headers()
    def do_GET(self):
        if not self.host_ok(): return self.respond(403,{"error":"Host is not allowed"})
        if self.headers.get("Origin") and not self.origin_ok(): return self.respond(403,{"error":"Origin is not allowed"})
        if self.path=="/health": return self.respond(200,{**HEALTH,"queueSize":QUEUE.qsize()})
        match=re.fullmatch(r"/tasks/([a-f0-9]{32})",self.path)
        if not match: return self.respond(404,{"error":"Endpoint does not exist"})
        with LOCK: task=TASKS.get(match.group(1))
        return self.respond(200,task) if task else self.respond(404,{"error":"Task does not exist"})
    def do_POST(self):
        if not self.host_ok() or not self.origin_ok(): return self.respond(403,{"error":"Origin is not allowed"})
        if self.path!="/tasks": return self.respond(404,{"error":"Endpoint does not exist"})
        if HEALTH["status"]!="ready": return self.respond(503,{"error":HEALTH.get("error","Backend is not ready")})
        if QUEUE.full(): return self.respond(429,{"error":"Local GPU queue is full"})
        try:
            length=int(self.headers.get("Content-Length","0"))
            if length<=0: return self.respond(411,{"error":"Content-Length is required"})
            if length>MAX_BYTES+65536: return self.respond(413,{"error":"Image exceeds the 8 MiB limit"})
            content_type=self.headers.get("Content-Type","")
            if not content_type.startswith("multipart/form-data;"): return self.respond(415,{"error":"Expected multipart form data"})
            body=self.rfile.read(length)
            if len(body)!=length: return self.respond(400,{"error":"Incomplete request body"})
            message=BytesParser(policy=default).parsebytes(("Content-Type: "+content_type+"\r\nMIME-Version: 1.0\r\n\r\n").encode("ascii")+body)
            fields={}
            for part in message.iter_parts():
                name=part.get_param("name",header="content-disposition")
                if name in fields: raise ValueError("Duplicate form field")
                fields[name]=part.get_payload(decode=True)
            kind=fields.get("kind",b"").decode("ascii")
            if kind not in KINDS: return self.respond(400,{"error":"Unsupported asset kind"})
            image_data=fields.get("image",b"")
            if not image_data or len(image_data)>MAX_BYTES: return self.respond(413,{"error":"Expected an image smaller than 8 MiB"})
            image=Image.open(io.BytesIO(image_data))
            if image.format not in {"PNG","WEBP","JPEG"}: return self.respond(415,{"error":"Unsupported image format"})
            if min(image.size)<32 or max(image.size)>8192: return self.respond(400,{"error":"Image dimensions must be 32–8192 pixels"})
            image.load()
            image=image.convert("RGBA")
            if image.getextrema()[3][0]==255: return self.respond(400,{"error":"当前本地入口需要透明背景 PNG/WebP；尚未接入自动背景分割。"})
            task_id=uuid.uuid4().hex;directory=OUTPUT/task_id/"input";directory.mkdir(parents=True)
            source=directory/(kind+"-reference-v1.png");image.save(source)
            task={"taskId":task_id,"kind":kind,"status":"queued","stage":"queued","submittedAt":now(),"provider":"Local GPU","model":"stabilityai/TripoSR","input":{"bytes":len(image_data),"uploadedSha256":hashlib.sha256(image_data).hexdigest(),"savedPNGBytes":source.stat().st_size,"dimensions":list(image.size)}}
            with LOCK:
                if QUEUE.full(): return self.respond(429,{"error":"Local GPU queue is full"})
                TASKS[task_id]=task;save_task(task);QUEUE.put_nowait(task_id)
            return self.respond(202,{"taskId":task_id,"status":"queued","stage":"queued"})
        except (ValueError,UnicodeError,Image.DecompressionBombError) as error: return self.respond(400,{"error":str(error)})
        except Exception as error: return self.respond(400,{"error":"Invalid image or form data: "+str(error)[:200]})
    def log_message(self,format,*args): print(json.dumps({"http":format%args,"at":now()}),flush=True)

for directory in OUTPUT.iterdir():
    if directory.is_dir() and re.fullmatch(r"[a-f0-9]{32}",directory.name):
        try:
            task=json.loads((directory/"task.json").read_text(encoding="utf-8"))
            if task.get("status") in {"queued","running"}: task.update(status="failed",stage="interrupted",error="Local service restarted before task completion",completedAt=now());save_task(task)
            TASKS[directory.name]=task
        except (OSError,ValueError): pass

threading.Thread(target=verify_backend,daemon=True).start()
threading.Thread(target=worker,daemon=True).start()
print(json.dumps({"server":"http://127.0.0.1:4197","provider":"Local GPU","model":"stabilityai/TripoSR","status":"checking"}),flush=True)
server=ThreadingHTTPServer(("127.0.0.1",4197),Handler)
try: server.serve_forever()
except KeyboardInterrupt: pass
finally:
    with LOCK:
        process=ACTIVE["process"];task_id=ACTIVE["taskId"]
        if process is not None and process.poll() is None:
            process.terminate()
            if task_id: change(task_id,status="failed",stage="interrupted",error="Local service stopped during inference",completedAt=now())
    server.server_close()
