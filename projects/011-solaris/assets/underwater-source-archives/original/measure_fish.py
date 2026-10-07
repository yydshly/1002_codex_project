import bpy,json,math
from pathlib import Path
root=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris/web/underwater/assets')
bpy.ops.wm.open_mainfile(filepath=str(root/'original/animated-fish/Animated Fish Pack by @Quaternius/Blends/Fish3.blend'))
center=(0,.8143562078475952,.3117998242378235)
report={'samples':201,'range':[0,31],'fps':24,'blenderSourceCenter':center,'gltfSourceCenter':[0,center[2],-center[1]],'maximumHorizontalRadiusOriginal':0,'maximumHorizontalRadiusFrame':0,'allPoseMin':[math.inf]*3,'allPoseMax':[-math.inf]*3,'rootLocations':[]}
for i in range(201):
 frame=31*i/200
 bpy.context.scene.frame_set(math.floor(frame),subframe=frame%1)
 deps=bpy.context.evaluated_depsgraph_get()
 for ob in bpy.data.objects:
  if ob.type=='MESH':
   eval=ob.evaluated_get(deps)
   for v in eval.data.vertices:
    p=eval.matrix_world@v.co
    coords=(p.x,p.z,-p.y)
    for j in range(3):
     report['allPoseMin'][j]=min(report['allPoseMin'][j],coords[j]);report['allPoseMax'][j]=max(report['allPoseMax'][j],coords[j])
    radius=math.hypot(p.x-center[0],p.y-center[1])
    if radius>report['maximumHorizontalRadiusOriginal']:
     report['maximumHorizontalRadiusOriginal']=radius;report['maximumHorizontalRadiusFrame']=frame
  if ob.type=='ARMATURE':
   b=ob.pose.bones['Root']
   if i%50==0:report['rootLocations'].append({'frame':frame,'location':list(b.location),'rotation':list(b.rotation_quaternion),'objectLocation':list(ob.location)})
report['recommendedUniformScale']=.073
report['maximumHorizontalRadiusScaled']=report['maximumHorizontalRadiusOriginal']*.073
(root/'motion-envelope.json').write_text(json.dumps(report,indent=2)+'\n')
print('ENVELOPE '+json.dumps(report))
