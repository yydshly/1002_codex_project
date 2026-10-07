import bpy, json
from pathlib import Path
p=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris/web/underwater/assets/original/animated-fish/Animated Fish Pack by @Quaternius/Blends/Fish3.blend')
bpy.ops.wm.open_mainfile(filepath=str(p))
for ob in bpy.data.objects:
 if ob.type=='ARMATURE': print('BONES '+json.dumps([{'name':b.name,'head':list(b.head_local),'tail':list(b.tail_local)} for b in ob.data.bones]))
 if ob.type=='MESH': print('BOUNDS '+json.dumps({'name':ob.name,'min':[min(v.co[i] for v in ob.data.vertices) for i in range(3)],'max':[max(v.co[i] for v in ob.data.vertices) for i in range(3)],'faces':len(ob.data.polygons),'nodes':[{'name':m.name,'nodes':[{'type':n.type,'color':list(n.inputs['Base Color'].default_value) if n.type=='BSDF_PRINCIPLED' else None} for n in m.node_tree.nodes]} for m in ob.data.materials]}))
