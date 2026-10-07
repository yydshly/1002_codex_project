import bpy, json
from pathlib import Path
root=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris/web/underwater/assets')
for file in (root/'original/animated-fish').rglob('Fish*.blend'):
 bpy.ops.wm.open_mainfile(filepath=str(file))
 report={'file':str(file),'objects':[],'actions':[]}
 for ob in bpy.data.objects:
  report['objects'].append({'name':ob.name,'type':ob.type,'dimensions':list(ob.dimensions),'rotation':list(ob.rotation_euler),'location':list(ob.location),'vertices':len(ob.data.vertices) if ob.type=='MESH' else None,'boneNames':[b.name for b in ob.data.bones] if ob.type=='ARMATURE' else None})
 for act in bpy.data.actions:
  report['actions'].append({'name':act.name,'range':list(act.frame_range)})
 report['materials']=[{'name':m.name,'color':list(m.diffuse_color),'nodes':m.use_nodes} for m in bpy.data.materials]
 print('ASSETREPORT '+json.dumps(report))
