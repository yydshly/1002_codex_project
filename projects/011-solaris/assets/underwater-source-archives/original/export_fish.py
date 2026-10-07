import bpy
from pathlib import Path
root=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris/web/underwater/assets')
(root/'models').mkdir(exist_ok=True)
source=root/'original/animated-fish/Animated Fish Pack by @Quaternius/Blends/Fish3.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
bpy.context.scene.frame_set(0)
bpy.context.scene.render.fps=24
for mat in bpy.data.materials:
 # Reconnect Blender's automatic legacy material conversion to the equivalent glTF PBR shader.
 # No source material colour, assigned face, vertex, normal, rig or animation data is changed.
 nodes=mat.node_tree.nodes
 color=tuple(mat.diffuse_color)
 nodes.clear()
 principled=nodes.new('ShaderNodeBsdfPrincipled')
 output=nodes.new('ShaderNodeOutputMaterial')
 principled.inputs['Base Color'].default_value=color
 mat.node_tree.links.new(principled.outputs['BSDF'],output.inputs['Surface'])
 principled.inputs['Metallic'].default_value=0
 principled.inputs['Roughness'].default_value=.65
bpy.ops.export_scene.gltf(filepath=str(root/'models/clownfish.glb'),export_format='GLB',export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_skins=True,export_morph=True,export_cameras=False,export_lights=False,export_apply=False)
print('EXPORTED '+str(root/'models/clownfish.glb'))
