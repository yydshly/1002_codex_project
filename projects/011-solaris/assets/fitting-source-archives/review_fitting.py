"""Visual asset review, no runtime/export mutation."""
import bpy,math
from pathlib import Path
from mathutils import Vector
ARC=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris/assets/fitting-source-archives')
bpy.ops.wm.open_mainfile(filepath=str(ARC/'atelier-fitting-complete.blend'))
rig=bpy.data.objects['Fitting_Rig_53']
fabric=bpy.data.materials['Fitting_Fabric'];fabric.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.075,.115,.065,1)
world=bpy.data.worlds.new('Review neutral studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.35,.34,.31,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.42;bpy.context.scene.world=world
def area(name,loc,power,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
area('Front key',(2,-3,3.5),500,3);area('Front fill',(-3,-1,2),220,3);area('Back rim',(1,3,3),450,2.5)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));plane=bpy.context.object;plane.name='Asset review floor only';m=bpy.data.materials.new('Review floor');m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.28,.27,.23,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.88;plane.data.materials.append(m)
cam=bpy.data.cameras.new('Fit visual review');o=bpy.data.objects.new('Fit visual review',cam);bpy.context.collection.objects.link(o);cam.type='ORTHO';cam.ortho_scale=2.03;bpy.context.scene.camera=o
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.render.film_transparent=False
for sku in ['tee-01','jacket-01']:
 for obj in bpy.data.objects:
  if obj.type=='MESH' and '_garment_' in obj.name:obj.hide_render=not obj.name.startswith(sku+'_')
 for kind in ['neutral','reach']:
  rig.animation_data.action=bpy.data.actions['Fitting_'+kind.title()];scene.frame_set(0)
  for view,location in [('front',(1.6,-4,1.95)),('back',(-1.6,4,1.95)),('side',(4,-.04,1.95))]:
   o.location=location;o.rotation_euler=(Vector((0,0,.88))-o.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(ARC/(sku+'-'+kind+'-'+view+'-review.png'));bpy.ops.render.render(write_still=True)
