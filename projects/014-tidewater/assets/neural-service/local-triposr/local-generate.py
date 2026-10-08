"""Genuine official TripoSR inference using a project-local CUDA environment.

The adapter only prepares alpha input, extracts the predicted density surface,
bakes neural RGB into a UV atlas, and exports a y-up self-contained GLB.
It does not synthesize hand-authored geometry or claim TRELLIS/PBR inference.
"""
import argparse, hashlib, json, os, pathlib, sys, time, traceback
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", str(ROOT / "model-cache" / "hf"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
sys.path.insert(0, str(ROOT / "upstream" / "TripoSR-main"))

def utc(): return datetime.now(timezone.utc).isoformat()
def sha(path):
    h = hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(8*1024*1024),b""): h.update(chunk)
    return h.hexdigest()

parser=argparse.ArgumentParser()
parser.add_argument("images",nargs="+")
parser.add_argument("--output-dir",required=True)
parser.add_argument("--resolution",type=int,default=256)
parser.add_argument("--texture-resolution",type=int,default=1024)
parser.add_argument("--max-faces",type=int,default=100000)
args=parser.parse_args()
if args.resolution not in (128,192,256,384): raise ValueError("Unsupported extraction resolution")
if args.texture_resolution not in (512,1024,2048): raise ValueError("Unsupported texture size")
outroot=pathlib.Path(args.output_dir).resolve();outroot.mkdir(parents=True,exist_ok=True)

import numpy as np
import torch
import trimesh
from PIL import Image
import tsr.models.tokenizers.image as tokenizer_module
from tsr.system import TSR
from tsr.utils import resize_foreground
from tsr.bake_texture import bake_texture

# Resolve the official DINO architecture configuration locally; pretrained
# tokenizer weights themselves come from the original TripoSR checkpoint.
tokenizer_module.hf_hub_download=lambda **kw: str(ROOT / "model-cache" / "dino-vitb16" / "config.json")
if not torch.cuda.is_available(): raise RuntimeError("CUDA GPU unavailable; actual generation was not executed")
torch.manual_seed(20261005)
torch.cuda.reset_peak_memory_stats()
start=time.monotonic()
print(json.dumps({"stage":"loading-model","device":torch.cuda.get_device_name(0)}),flush=True)
model=TSR.from_pretrained(str(ROOT / "model-cache" / "TripoSR"),config_name="config.yaml",weight_name="model.ckpt")
model.renderer.set_chunk_size(4096)
model.eval().to("cuda")
loadtime=time.monotonic()-start
modelmeta=json.loads((ROOT / "model-meta.json").read_text())
checkpoint=ROOT / "model-cache" / "TripoSR" / "model.ckpt"
expected=next(s["lfs"]["sha256"] for s in modelmeta["siblings"] if s["rfilename"]=="model.ckpt")
if sha(checkpoint)!=expected: raise RuntimeError("Official neural checkpoint SHA256 did not match")

for input_name in args.images:
    input_path=pathlib.Path(input_name).resolve();stem=input_path.stem.replace("-reference-v1","")
    output=outroot / stem;output.mkdir(parents=True,exist_ok=True)
    task="local-triposr-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")+"-"+stem
    log={"version":1,"provider":"Local GPU · Stability AI / Tripo AI","model":"stabilityai/TripoSR","modelRevision":modelmeta["sha"],"method":"neural-3d","taskId":task,"startedAt":utc(),"source":"https://github.com/VAST-AI-Research/TripoSR","license":"MIT","device":torch.cuda.get_device_name(0),"torchVersion":torch.__version__,"input":{"path":str(input_path),"sha256":sha(input_path),"kind":"image","sendsTextPrompt":False},"settings":{"extractionResolution":args.resolution,"textureResolution":args.texture_resolution,"chunkSize":4096,"neuralDensityThreshold":25.0},"modelLoadSeconds":round(loadtime,3),"timings":{},"adaptations":json.loads((ROOT/"upstream-adaptations.json").read_text())["changes"]}
    def save(): (output/"generation-log.json").write_text(json.dumps(log,indent=2),encoding="utf-8")
    def stage(name): print(json.dumps({"stage":name,"taskId":task}),flush=True)
    try:
        image=Image.open(input_path).convert("RGBA")
        if image.getextrema()[3][0]==255: raise ValueError("A transparent background reference is required")
        image=resize_foreground(image,0.85)
        rgba=np.asarray(image,dtype=np.float32)/255.0
        rgb=rgba[:,:,:3]*rgba[:,:,3:]+(1-rgba[:,:,3:])*0.5
        image=Image.fromarray(np.clip(rgb*255,0,255).astype(np.uint8));image.save(output/"model-input.png")
        torch.cuda.reset_peak_memory_stats();t=time.monotonic();stage("neural-inference")
        with torch.inference_mode(): scene_codes=model([image],device="cuda")
        torch.cuda.synchronize();log["timings"]["neuralInferenceSeconds"]=round(time.monotonic()-t,3);save()
        t=time.monotonic();stage("extracting-neural-surface")
        meshes=model.extract_mesh(scene_codes,False,resolution=args.resolution)
        mesh=meshes[0]
        if len(mesh.faces)>args.max_faces:
            try: mesh=mesh.simplify_quadric_decimation(face_count=args.max_faces)
            except Exception as error: log["decimationWarning"]=str(error)
        log["timings"]["surfaceExtractionSeconds"]=round(time.monotonic()-t,3);save()
        t=time.monotonic();stage("baking-neural-rgb-texture")
        baked=bake_texture(mesh,model,scene_codes[0],args.texture_resolution)
        log["timings"]["textureBakeSeconds"]=round(time.monotonic()-t,3)
        texture=Image.fromarray(np.clip(baked["colors"]*255,0,255).astype(np.uint8)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        texture.save(output/"texture.png")
        material=trimesh.visual.material.PBRMaterial(name="TripoSR neural RGB atlas",baseColorTexture=texture,metallicFactor=0.0,roughnessFactor=0.85,doubleSided=True,alphaMode="OPAQUE")
        visual=trimesh.visual.texture.TextureVisuals(uv=baked["uvs"],material=material)
        textured=trimesh.Trimesh(vertices=mesh.vertices[baked["vmapping"]],faces=baked["indices"],visual=visual,process=False)
        # TripoSR world uses Z up; web renderer and glTF use Y up.
        textured.apply_transform(trimesh.transformations.rotation_matrix(-np.pi/2,[1,0,0]))
        log["orientationAdaptation"]={"sourceUp":"Z","outputUp":"Y","rotationXDegrees":-90,"nonUniformScale":False}
        if stem=="boat" and textured.extents[0]>textured.extents[2]:
            textured.apply_transform(trimesh.transformations.rotation_matrix(np.pi/2,[0,1,0]))
            log["orientationAdaptation"]["rotationYDegrees"]=90
            log["orientationAdaptation"]["boatLongAxis"]="Z"
        if not np.all(np.isfinite(textured.vertices)): raise ValueError("Generated mesh has nonfinite vertices")
        if np.any(textured.extents<=1e-6): raise ValueError("Generated mesh bounds are degenerate")
        glb=output/(stem+"-generated-v1.glb");textured.export(glb)
        log["output"]={"path":str(glb),"bytes":glb.stat().st_size,"sha256":sha(glb),"vertices":len(textured.vertices),"triangles":len(textured.faces),"bounds":{"min":textured.bounds[0].tolist(),"max":textured.bounds[1].tolist()},"textureResolution":list(texture.size),"textureSource":"Neural RGB predictions baked into UV atlas","materialNote":"Base color generated by TripoSR; roughness=0.85/metalness=0 are explicit renderer defaults, not neural PBR material synthesis"}
        log["gpuPeakAllocatedMiB"]=round(torch.cuda.max_memory_allocated()/1048576,2)
        log["gpuPeakReservedMiB"]=round(torch.cuda.max_memory_reserved()/1048576,2)
        log["completedAt"]=utc();save();print(json.dumps({"stage":"complete","taskId":task,"output":log["output"],"gpuPeakAllocatedMiB":log["gpuPeakAllocatedMiB"]}),flush=True)
        del scene_codes,meshes,mesh,baked,textured
        torch.cuda.empty_cache()
    except Exception as error:
        log["failure"]={"at":utc(),"message":str(error),"traceback":traceback.format_exc()};save();raise
