"""Local walkthrough hosting: replay evidence + embed the actual CAD plugin viewer."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
from urllib.parse import unquote, urlparse

ROOT=Path(__file__).resolve().parents[1]
WEB=ROOT/'web/telescope-demo'

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        route=urlparse(self.path).path
        evidence={'/api/target':'telescope-target.json','/api/report':'telescope-validation.json',
                  '/api/before':'telescope-validation-before-repair.json','/api/build':'telescope-build-log.json',
                  '/api/review':'telescope-visual-review.json'}
        if route=='/api/config':
            data={'viewer_url':self.server.viewer_url,'mode':'completed_process_replay_with_live_cad_viewer'}
        elif route in evidence:
            try: data=json.loads((ROOT/'notes'/evidence[route]).read_text(encoding='utf-8-sig'))
            except FileNotFoundError:
                self.send_error(404,'Evidence has not been generated'); return
        else:
            return super().do_GET()
        content=json.dumps(data,ensure_ascii=False).encode('utf8')
        self.send_response(200)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(content)))
        self.send_header('Cache-Control','no-store')
        self.end_headers(); self.wfile.write(content)

    def translate_path(self,path):
        route=unquote(urlparse(path).path)
        if route.startswith('/artifacts/'):
            relative=Path(route.removeprefix('/artifacts/'))
            target=(ROOT/relative).resolve()
            if target.is_relative_to(ROOT) and relative.parts and relative.parts[0] in {'STEP','GLB','assets','notes','src','checks','scripts'}:
                return str(target)
            return str(WEB/'__invalid_artifact__')
        return super().translate_path(path)

    def log_message(self,format,*args):
        if str(args[1]) not in {'200','304'}: super().log_message(format,*args)

def main():
    import os
    env=dict(os.environ)
    env.update(OPENBLAS_NUM_THREADS='1',OMP_NUM_THREADS='1',MKL_NUM_THREADS='1',CADGEN_CACHE_DIR=str(ROOT/'.cache/cadgen'))
    result=subprocess.run([sys.executable,'-m','cadgen.cli','viewer','--host','127.0.0.1','--json','--detach'],cwd=ROOT,env=env,capture_output=True,text=True,encoding='utf8',errors='replace')
    if result.returncode:
        sys.stderr.write(result.stdout+result.stderr); return result.returncode
    records=[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
    if not records: raise RuntimeError('CAD viewer did not return its actual URL')
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(WEB)))
    server.viewer_url=records[-1]['url']
    print(json.dumps({'demo_url':f'http://127.0.0.1:{server.server_port}/','cad_viewer_url':server.viewer_url}),flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
    return 0

if __name__=='__main__': sys.exit(main())
