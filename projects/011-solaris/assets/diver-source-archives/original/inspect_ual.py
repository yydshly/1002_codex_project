import bpy,json
from pathlib import Path
r=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris/assets/diver-source-archives/original')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(next((r/'quaternius-ual').rglob('*.glb'))))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
mesh=next(o for o in bpy.data.objects if o.type=='MESH')
print('OBJECTS',[(o.name,o.type,list(o.location),list(o.rotation_euler),list(o.scale)) for o in bpy.data.objects])
print('BONES',[(b.name,list(b.head_local),list(b.tail_local)) for b in rig.data.bones])
print('ACTIONS',[(a.name,list(a.frame_range))for a in bpy.data.actions])
print('MESH',len(mesh.data.vertices),len(mesh.data.polygons),len(mesh.vertex_groups))
r.joinpath('import-inspection.json').write_text(json.dumps({'rig':rig.name,'mesh':mesh.name,'bones':[{ 'name':b.name,'head':list(b.head_local),'tail':list(b.tail_local)}for b in rig.data.bones],'actions':[{ 'name':a.name,'frames':list(a.frame_range)}for a in bpy.data.actions],'originalVertices':len(mesh.data.vertices),'originalPolygons':len(mesh.data.polygons)},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(r/'ual-import.blend'))
