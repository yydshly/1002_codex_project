"""Actual frozen avatar plus registered footwear review, excluded from runtime."""
import bpy,math,sys
from pathlib import Path
from mathutils import Vector
ARC=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris/assets/fitting-footwear-source-archives')
bpy.ops.wm.open_mainfile(filepath=str(ARC/'atelier-footwear-complete.blend'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
world=bpy.data.worlds.new('Footwear photo review');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.36,.35,.32,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4;bpy.context.scene.world=world
def area(name,loc,power,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,-.04,.12))-o.location).to_track_quat('-Z','Y').to_euler()
area('Shoe softbox front',(.45,-.55,.8),70,.9);area('Shoe softbox fill',(-.5,-.1,.5),30,.8);area('Shoe rim',(.1,.6,.5),45,.7)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.0001));floor=bpy.context.object;floor.name='Review floor only';m=bpy.data.materials.new('Footwear floor');m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.31,.29,.26,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85;floor.data.materials.append(m)
cam=bpy.data.cameras.new('Footwear review camera');o=bpy.data.objects.new('Footwear review camera',cam);bpy.context.collection.objects.link(o);cam.type='ORTHO';bpy.context.scene.camera=o
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1200;scene.render.resolution_y=950;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.render.film_transparent=False
views=[('front',(.32,-.74,.39),(0,-.055,.105),.47),('side',(.65,-.05,.29),(0,-.04,.105),.46),('back',(.24,.74,.34),(0,.018,.12),.45),('detail',(.27,-.5,.37),(.091,-.038,.105),.31)]
for sku in (['boot-01'] if '--ridge-only' in sys.argv else ['court-01','boot-01']):
 for obj in bpy.data.objects:
  if obj.type=='MESH'and (obj.name.startswith('court-01_')or obj.name.startswith('boot-01_')):obj.hide_render=not obj.name.startswith(sku+'_')
 for pose in ['neutral','reach']:
  rig.animation_data.action=next(a for a in bpy.data.actions if a.name.startswith('Fitting_'+pose.title()));scene.frame_set(0)
  for view,loc,target,size in views:
   o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();cam.ortho_scale=size;scene.render.filepath=str(ARC/(sku+'-'+pose+'-'+view+'-review.png'));bpy.ops.render.render(write_still=True)
 # Standalone real outsole bottom photo, original avatar remains to detect floor leak.
 floor.hide_render=True;o.location=(.25,-.25,-.5);o.rotation_euler=(Vector((0,-.04,.03))-o.location).to_track_quat('-Z','Y').to_euler();cam.ortho_scale=.43;scene.render.filepath=str(ARC/(sku+'-underside-review.png'));bpy.ops.render.render(write_still=True);floor.hide_render=False
