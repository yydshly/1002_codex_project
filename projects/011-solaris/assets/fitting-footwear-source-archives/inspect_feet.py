import bpy,json
from pathlib import Path
ROOT=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris')
ARC=ROOT/'assets/fitting-footwear-source-archives';ARC.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'web/fitting/assets/avatar.glb'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
print('IMPORT',[(o.name,o.type)for o in bpy.data.objects])
clip=next(a for a in bpy.data.actions if a.name.startswith('Fitting_Neutral'))
rig.animation_data_create();rig.animation_data.action=clip;bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
points=[]
for obj in bpy.data.objects:
 if obj.name!='Fitting_Avatar_CompleteBody':continue
 e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=e.to_mesh();points.extend(list(e.matrix_world@v.co)for v in mesh.vertices);e.to_mesh_clear()
report={'coordinateSystem':'Blender X right, Z up, -Y forward; glTF Y up,+Z front','footSelection':'full evaluated avatar vertices z<=.155, excludes shin above this height','side':{}}
for side,sign in [('L',1),('R',-1)]:
 foot=[p for p in points if p[2]<=.155 and p[0]*sign>0]
 report['side'][side]={'count':len(foot),'min':[min(p[k]for p in foot)for k in range(3)],'max':[max(p[k]for p in foot)for k in range(3)],'points':foot}
report['bones']={name:list(rig.matrix_world@rig.pose.bones[name].head)for name in ['DEF-foot.L','DEF-toe.L','DEF-foot.R','DEF-toe.R']}
(ARC/'avatar-feet-inspection.json').write_text(json.dumps(report,indent=2))
print('FEET_REPORT',json.dumps({**report,'side':{s:{k:v for k,v in r.items()if k!='points'}for s,r in report['side'].items()}}))
