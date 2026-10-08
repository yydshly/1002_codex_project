"""Publish a genuine TripoSR output and provenance, without touching the plan."""
import hashlib,json,pathlib,shutil,struct

KINDS={"cabin":"海岸小屋","lighthouse":"海岸灯塔","palm":"海岸棕榈树","boat":"海岸小船"}
def publish(log_path,destination,kind,url_prefix,task_id=None):
    if kind not in KINDS: raise ValueError("Unsupported scene asset kind")
    log=json.loads(pathlib.Path(log_path).read_text(encoding="utf-8"))
    if log.get("failure") or not log.get("completedAt") or not log.get("output"): raise ValueError("Neural job did not complete")
    source=pathlib.Path(log["output"]["path"]);data=source.read_bytes()
    if len(data)<20 or data[:4]!=b"glTF" or struct.unpack_from("<II",data,4)!=(2,len(data)): raise ValueError("Invalid GLB v2")
    digest=hashlib.sha256(data).hexdigest()
    if digest!=log["output"]["sha256"]: raise ValueError("Generated output SHA256 mismatch")
    json_length,json_type=struct.unpack_from("<II",data,12)
    if json_type!=0x4e4f534a: raise ValueError("Missing glTF JSON chunk")
    gltf=json.loads(data[20:20+json_length]);materials=gltf.get("materials",[])
    if not gltf.get("meshes") or not materials or not gltf.get("images"): raise ValueError("Generated GLB has no textured mesh")
    for image in gltf["images"]:
        if "uri" in image: raise ValueError("Generated textures must be embedded")
    dest=pathlib.Path(destination);dest.mkdir(parents=True,exist_ok=True)
    target=dest/"model.glb" if task_id else dest/(kind+"-generated-v1.glb")
    shutil.copyfile(source,target)
    reference=dest/"reference.png" if task_id else dest/(kind+"-reference-v1.png")
    input_source=pathlib.Path(log["input"]["path"])
    if input_source.resolve()!=reference.resolve(): shutil.copyfile(input_source,reference)
    receipt=dest/"receipt.json" if task_id else dest/(kind+"-generation-receipt.json")
    receipt.write_text(json.dumps(log,indent=2,ensure_ascii=False),encoding="utf-8")
    manifest={"version":1,"id":task_id or "triposr-"+kind+"-v1","title":"AI 生成的"+KINDS[kind],
        "provenance":{"method":"neural-image-to-3d","provider":"Local GPU · Stability AI / Tripo AI","model":log["model"],"source":log["source"],"softwareAndModelLicense":"MIT","modelRevision":log["modelRevision"],"generatedAt":log["completedAt"],"inputImageSha256":log["input"]["sha256"],"generationTaskId":task_id or log["taskId"],"inferenceTaskId":log["taskId"],"execution":"Local CUDA GPU","device":log["device"],"gpuPeakAllocatedMiB":log["gpuPeakAllocatedMiB"],"settings":log["settings"],"inputMode":"Image only; text brief is recorded outside model inference"},
        "asset":{"url":url_prefix+"/"+target.name,"referenceUrl":url_prefix+"/"+reference.name,"bytes":len(data),"sha256":digest,"triangles":log["output"]["triangles"],"vertices":log["output"]["vertices"],"bounds":log["output"]["bounds"],"embeddedTextures":len(gltf["images"]),"textureFormat":"PNG","materials":"Neural RGB baseColor; explicit non-neural roughness/metalness defaults","generatedWholeScene":False,"upAxis":"Y","textureResolution":log["output"]["textureResolution"]},
        "timings":[{"stage":name,"seconds":seconds} for name,seconds in log["timings"].items()],
        "receiptUrl":url_prefix+"/"+receipt.name,
        "limitations":["单物体重建；复用时保留原布局标记的位置和尺寸边界。","TripoSR 生成形状与 RGB 外观，不生成独立的法线、粗糙度或金属度贴图。","模型推测单张参考图不可见部分，需要检查树冠、灯室或船舱的背面形态。"]}
    manifest_path=dest/"manifest.json" if task_id else dest/(kind+"-generated-v1.manifest.json")
    manifest_path.write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding="utf-8")
    return {"glbUrl":manifest["asset"]["url"],"manifestUrl":url_prefix+"/"+manifest_path.name,"bytes":len(data),"sha256":digest,"provider":"Local GPU","model":log["model"],"license":"MIT; TripoSR 神经形状与 RGB 纹理，PBR 属性为默认值","receipt":log}

if __name__=="__main__":
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument("log");parser.add_argument("destination");parser.add_argument("kind");parser.add_argument("url_prefix");args=parser.parse_args()
    print(json.dumps(publish(args.log,args.destination,args.kind,args.url_prefix),ensure_ascii=False))
