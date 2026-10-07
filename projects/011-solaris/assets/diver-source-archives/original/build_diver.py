"""Local authored scuba equipment and finite trim/kick poses on the complete CC0 rig.
No source body mesh decimation, no remote animation/inference service.
"""
import bpy,math,json,struct
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
ROOT=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris')
ARC=ROOT/'assets/diver-source-archives/original'
OUT=ROOT/'web/underwater/assets/diver'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(next((ARC/'quaternius-ual').rglob('*.glb'))))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
body=bpy.data.objects['Mannequin']
original={'vertices':len(body.data.vertices),'polygons':len(body.data.polygons),'triangles':sum(len(p.vertices)-2 for p in body.data.polygons),'bones':len(rig.data.bones)}
unchangedBodyVertices=[list(v.co)for v in body.data.vertices]
unchangedBodyFaces=[list(p.vertices)for p in body.data.polygons]
sourceTopology={'verticesGlTFYUp':[[v[0],v[2],-v[1]]for v in unchangedBodyVertices],'triangles':unchangedBodyFaces,'note':'Immediately imported complete source body before local material/equipment/pose authoring. Exactly one duplicate source triangle is removed by Blender mesh validation.'}
(ARC/'source-body-topology.json').write_text(json.dumps(sourceTopology,separators=(',',':')))
rig.animation_data_clear()
for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
objects=[rig,body]
for o in list(bpy.context.scene.objects):
 if o not in objects:
  for collection in list(o.users_collection):collection.objects.unlink(o)

def material(name,color,rough=.55,metal=0,alpha=1):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,alpha)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,alpha);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;p.inputs['Alpha'].default_value=alpha
 if alpha<1:m.surface_render_method='DITHERED'
 return m
neoprene=material('Neoprene deep teal',(.012,.034,.041),.82)
joint=material('Flexible neoprene joints',(.006,.015,.021),.88)
rubber=material('Harness and flexible rubber',(.008,.011,.014),.68)
orange=material('Safety amber equipment',(.98,.47,.045),.36)
teal=material('Fin blade teal',(.014,.23,.23),.47)
silver=material('Brushed valve metal',(.3,.38,.42),.28,.62)
lens=material('Mask mineral blue glass',(.32,.67,.7),.12,.03,.57)
white=material('Gauge face and markings',(.82,.86,.79),.55)
body.data.materials.clear();body.data.materials.append(neoprene);body.data.materials.append(joint)
for p in body.data.polygons:p.use_smooth=True

def skin(o,bone,mat):
 o.data.materials.append(mat)
 if hasattr(o.data,'polygons'):
  for p in o.data.polygons:p.use_smooth=True
 vg=o.vertex_groups.new(name=bone);vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
 mod=o.modifiers.new('Equipment follows complete humanoid rig','ARMATURE');mod.object=rig
 objects.append(o);return o
def mesh(name,verts,faces,bone,mat):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);return skin(o,bone,mat)
def apply_geom(o):
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.select_set(False)
 return o
def cube(name,location,size,bone,mat,bevel=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.dimensions=size;apply_geom(o)
 if bevel:
  m=o.modifiers.new('Manufactured rounded edges','BEVEL');m.width=bevel;m.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 return skin(o,bone,mat)
def cylinder(name,location,radius,depth,bone,mat,axis='Z',vertices=24):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=location);o=bpy.context.object;o.name=name
 if axis=='Y':o.rotation_euler.x=math.pi/2
 if axis=='X':o.rotation_euler.y=math.pi/2
 apply_geom(o)
 m=o.modifiers.new('Rounded cylinder lip','BEVEL');m.width=min(radius*.12,.013);m.segments=2;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
 return skin(o,bone,mat)
def sphere(name,location,scale,bone,mat):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=location);o=bpy.context.object;o.name=name;o.scale=scale;apply_geom(o);return skin(o,bone,mat)
def tube(name,points,radius,bone,mat):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=8;d.bevel_depth=radius;d.bevel_resolution=3
 s=d.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for b,p in zip(s.bezier_points,points):b.co=p;b.handle_left_type=b.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return skin(o,bone,mat)
def ring(name,center,rx,ry,r,bone,mat):
 p=[(center[0]+rx*math.cos(2*math.pi*i/48),center[1]+ry*math.sin(2*math.pi*i/48),center[2])for i in range(49)]
 return tube(name,p,r,bone,mat)

# Complete fabricated equipment is authored at the unchanged source rest pose.
cube('Buoyancy vest backplate',(0,.116,1.233),(.305,.07,.45),'DEF-spine.002',rubber,.035)
cylinder('Single compressed air tank',(0,.232,1.22),.089,.46,'DEF-spine.002',orange)
sphere('Tank shoulder dome',(0,.232,1.452),(.089,.089,.063),'DEF-spine.002',orange)
sphere('Tank rounded base',(0,.232,.985),(.09,.09,.041),'DEF-spine.002',rubber)
cylinder('Tank brass neck',(0,.232,1.516),.028,.045,'DEF-spine.002',silver)
cylinder('First stage regulator',(0,.226,1.544),.032,.078,'DEF-spine.002',silver,'X')
cylinder('Valve hand wheel',(.051,.226,1.55),.032,.019,'DEF-spine.002',rubber,'X')
for z in [1.08,1.35]:ring('Tank retaining band '+str(z),(0,.232,z),.092,.092,.011,'DEF-spine.002',rubber)
for sign,side in [(1,'L'),(-1,'R')]:
 tube('Shoulder harness '+side,[(sign*.123,.11,1.38),(sign*.145,-.015,1.47),(sign*.15,-.121,1.33),(sign*.13,-.128,1.13)],.021,'DEF-spine.002',rubber)
 cube('Harness quick release '+side,(sign*.14,-.146,1.25),(.054,.021,.073),'DEF-spine.002',orange,.008)
ring('Waist harness',(0,.013,1.07),.181,.13,.024,'DEF-hips',rubber)
cube('Waist stainless buckle',(0,-.123,1.07),(.08,.023,.053),'DEF-hips',silver,.006)
cube('Chest safety marking',(0,-.112,1.305),(.08,.012,.049),'DEF-spine.003',orange,.005)

# Mask has a twin-lens frame, translucent lens regions, nose pocket and head strap.
cube('Mask flexible skirt',(0,-.109,1.661),(.246,.052,.123),'DEF-head',rubber,.035)
for sign,side in [(1,'L'),(-1,'R')]:
 cube('Mask amber rim '+side,(sign*.059,-.141,1.664),(.113,.026,.105),'DEF-head',orange,.022)
 cube('Mask blue glass '+side,(sign*.059,-.157,1.665),(.092,.008,.082),'DEF-head',lens,.017)
mesh('Mask anatomical nose pocket',[(-.027,-.138,1.62),(.027,-.138,1.62),(0,-.185,1.608),(0,-.172,1.657) ],[(0,1,2),(0,3,1),(0,2,3),(1,3,2)],'DEF-head',rubber)
tube('Mask adjustable head strap',[(-.122,-.07,1.66),(-.126,.042,1.66),(0,.092,1.66),(.126,.042,1.66),(.122,-.07,1.66)],.017,'DEF-head',rubber)
cylinder('Second stage breathing regulator',(0,-.137,1.587),.039,.047,'DEF-head',rubber,'Y')
cylinder('Regulator front amber ring',(0,-.164,1.587),.03,.01,'DEF-head',orange,'Y')
for x in [-.015,0,.015]:cube('Regulator vent '+str(x),(x,-.171,1.587),(.005,.005,.027),'DEF-head',rubber,.001)
tube('Flexible breathing hose',[(.021,.23,1.545),(.22,.14,1.50),(.244,-.045,1.495),(.16,-.174,1.554),(.028,-.15,1.585)],.012,'DEF-spine.003',rubber)
tube('Low pressure inflator hose',[(-.026,.239,1.535),(-.192,.121,1.442),(-.184,-.101,1.365),(-.16,-.158,1.29)],.010,'DEF-spine.003',rubber)
cube('Inflator control',(-.161,-.15,1.27),(.04,.03,.068),'DEF-spine.003',silver,.009)

# Fin blades, boots, edge rails and flexible foot pockets are bound to each real foot.
for side in ['L','R']:
 bone='DEF-foot.'+side;frame=rig.data.bones[bone].matrix_local
 rings=[(.06,.055,.015),(.17,.070,.016),(.34,.095,.010),(.58,.104,.004),(.67,.088,-.001)]
 verts=[]
 for y,w,bend in rings:
  for x,z in [(-w,bend-.009),(w,bend-.009),(w,bend+.009),(-w,bend+.009)]:verts.append(tuple(frame@Vector((x,y,z))))
 faces=[(0,3,2,1),(16,17,18,19)]
 for i in range(4):
  for k in range(4):a=i*4+k;b=i*4+(k+1)%4;faces.append((a,b,b+4,a+4))
 mesh('Complete tapered fin blade '+side,verts,faces,bone,teal)
 for sign in [-1,1]:
  pts=[tuple(frame@Vector((sign*w*.88,y,bend+.011)))for y,w,bend in rings]
  tube('Fin reinforced rail '+side+str(sign),pts,.009,bone,orange)
 pts=[tuple(frame@Vector((0,y,.028)))for y in [.055,.09,.13,.17,.20]]
 tube('Fin boot foot pocket '+side,pts,.041,bone,rubber)
 pts=[tuple(frame@Vector((.049*math.cos(2*math.pi*i/40),.033,.035+.035*math.sin(2*math.pi*i/40))))for i in range(41)]
 tube('Fin adjustable heel strap '+side,pts,.011,bone,orange)

# Readable wrist instrument; decorative display, not a dive computer.
g=rig.data.bones['DEF-forearm.L'].matrix_local
center=g@Vector((0,.22,.038))
cylinder('Wrist gauge casing',tuple(center),.037,.018,'DEF-forearm.L',rubber,'Z')
cylinder('Wrist gauge face',tuple(center+Vector((0,0,.011))),.029,.007,'DEF-forearm.L',white,'Z')
tube('Gauge decorative needle',[tuple(center+Vector((-.012,-.009,.017))),tuple(center+Vector((.018,.012,.017)))],.0025,'DEF-forearm.L',orange)

# Author a stable horizontal scuba trim rather than copying a freestyle crawl.
def point_bone(name,dir):
 pb=rig.pose.bones[name];base=pb.bone.matrix_local
 rest_axis=base.to_3x3().col[1].normalized();q=rest_axis.rotation_difference(Vector(dir).normalized())
 desired=(q.to_matrix().to_4x4()@base);desired.translation=pb.head
 pb.matrix=desired;bpy.context.view_layer.update()
for side,sign in [('L',1),('R',-1)]:
 point_bone('DEF-upper_arm.'+side,(sign*.08,-.17,-.22))
 point_bone('DEF-forearm.'+side,(-sign*.025,-.045,.266))
 point_bone('DEF-hand.'+side,(0,-.06,1))
 point_bone('DEF-thigh.'+side,(sign*.028,.035,-.40))
 point_bone('DEF-shin.'+side,(0,.085,-.42))
 point_bone('DEF-foot.'+side,(0,.03,-.172))
 point_bone('DEF-toe.'+side,(0,.03,-.17))
point_bone('DEF-head',(0,.045,.074))
rig.pose.bones['root'].rotation_mode='QUATERNION'
rig.pose.bones['root'].rotation_quaternion=Quaternion((0,0,1),math.pi/2)@Quaternion((1,0,0),math.pi/2)
bpy.context.view_layer.update()
base={p.name:(p.location.copy(),p.rotation_quaternion.copy() if p.rotation_mode=='QUATERNION' else p.rotation_euler.to_quaternion(),p.scale.copy())for p in rig.pose.bones}
for p in rig.pose.bones:p.rotation_mode='QUATERNION'
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
bpy.context.scene.render.fps=30
for name,moving in [('Diver_Hover',False),('Diver_Swim',True)]:
 action=bpy.data.actions.new(name);rig.animation_data_create();rig.animation_data.action=action
 for frame in range(49):
  phase=2*math.pi*frame/48
  for p in rig.pose.bones:
   loc,q,scale=base[p.name];p.location=loc;p.rotation_quaternion=q;p.scale=scale
   if moving:
    for side,offset in [('L',0),('R',math.pi)]:
     kick=math.sin(phase+offset)
     if p.name=='DEF-thigh.'+side:p.rotation_quaternion=q@Quaternion((1,0,0),.16*kick)
     elif p.name=='DEF-shin.'+side:p.rotation_quaternion=q@Quaternion((1,0,0),-.105*kick)
     elif p.name=='DEF-foot.'+side:p.rotation_quaternion=q@Quaternion((1,0,0),-.07*kick)
   for field in ['location','rotation_quaternion','scale']:p.keyframe_insert(field,frame=frame)
 rig.animation_data.action=None
 track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0,action);strip.extrapolation='NOTHING';track.mute=True
hover=bpy.data.actions['Diver_Hover'];swim=bpy.data.actions['Diver_Swim'];rig.animation_data.action=swim
assert unchangedBodyVertices==[list(v.co)for v in body.data.vertices]
assert unchangedBodyFaces==[list(p.vertices)for p in body.data.polygons]
def points():
 dg=bpy.context.evaluated_depsgraph_get();res=[]
 for obj in objects:
  if obj.type!='MESH':continue
  e=obj.evaluated_get(dg);m=e.to_mesh();res.extend(e.matrix_world@v.co for v in m.vertices);e.to_mesh_clear()
 return res
samples=[];all_points=[]
for i in range(201):
 t=48*i/200;bpy.context.scene.frame_set(int(t),subframe=t-int(t));bpy.context.view_layer.update();p=points();all_points.extend(p);samples.append((t,p))
mn=Vector([min(p[k]for p in all_points)for k in range(3)]);mx=Vector([max(p[k]for p in all_points)for k in range(3)]);center=(mn+mx)/2
max_radius=max(math.hypot(p.x-center.x,p.y-center.y)for p in all_points);scale=.383/max_radius
anchor=bpy.data.objects.new('DiverAnchorFixedCenter',None);bpy.context.collection.objects.link(anchor);anchor.location=-center*scale;anchor.scale=(scale,scale,scale)
for o in objects:
 if o.type=='MESH':o.parent=rig
rig.parent=anchor
objects.append(anchor)
rig.animation_data.action=hover;bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
info={'schema':1,'purpose':'201 finite Blender samples of complete authored scuba equipment and full source humanoid, not a continuous mathematical envelope proof','sampleCount':201,'sampledClip':'Diver_Swim','sourceBody':original,'authoredEquipmentMeshes':len([o for o in objects if o.type=='MESH'])-1,'sourceCenterBlenderZUp':list(center),'sourceScale':scale,'outputUp':'+Y','outputForward':'+X','fixedRootTranslation':[0,0,0],'clipDurationSeconds':1.6,'sourceBoundsBlenderZUp':{'min':list(mn),'max':list(mx)},'maximumHorizontalRadius':.383,'recommendedSafetyRadius':.4,'verticalExtents':[(mn.z-center.z)*scale,(mx.z-center.z)*scale],'horizontalLength':(mx.x-mn.x)*scale,'horizontalWidth':(mx.y-mn.y)*scale,'clips':['Diver_Hover','Diver_Swim']}
(OUT/'motion-envelope.json').write_text(json.dumps(info,indent=2))
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=str(ARC/'atelier-scuba-diver.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'scuba-diver.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_skins=True,export_morph=False,export_cameras=False,export_lights=False,export_apply=False)
# Set the file's default node pose to the authored hover pose. The exporter writes
# rest-node defaults even when an action is active; replacing only those defaults
# makes independent glTF viewers see horizontal trim before any animation starts.
# Packed geometry, inverse bind matrices and both animation clips remain intact.
packed=(OUT/'scuba-diver.glb').read_bytes();json_size=struct.unpack_from('<I',packed,12)[0]
gltf=json.loads(packed[20:20+json_size]);binary=packed[28+json_size:]
clip=next(c for c in gltf['animations']if c['name']=='Diver_Hover')
for channel in clip['channels']:
 accessor=gltf['accessors'][clip['samplers'][channel['sampler']]['output']];view=gltf['bufferViews'][accessor['bufferView']]
 width={'VEC3':3,'VEC4':4}[accessor['type']];start=view.get('byteOffset',0)+accessor.get('byteOffset',0)
 values=list(struct.unpack_from('<'+'f'*width,binary,start));target=gltf['nodes'][channel['target']['node']]
 target[channel['target']['path']]=values
json_data=json.dumps(gltf,separators=(',',':')).encode();json_data+=b' '*((-len(json_data))%4)
payload=struct.pack('<II',len(json_data),0x4e4f534a)+json_data+struct.pack('<II',len(binary),0x004e4942)+binary
(OUT/'scuba-diver.glb').write_bytes(struct.pack('<III',0x46546c67,2,len(payload)+12)+payload)
print('DIVER_REPORT',json.dumps(info))

# Independent editable model render, excluded from the GLB runtime.
rig.animation_data.action=hover;bpy.context.scene.frame_set(0)
world=bpy.data.worlds.new('Preview environment');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.09,.20,.23,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5;bpy.context.scene.world=world
def area(name,loc,energy,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key',(1.6,-1.6,2.8),500,3);area('Rim',(-1,1.3,2.2),400,2)
cam=bpy.data.cameras.new('Preview camera');o=bpy.data.objects.new('Preview camera',cam);bpy.context.collection.objects.link(o);o.location=(1.4,-2.1,1.4);o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler();cam.type='ORTHO';cam.ortho_scale=1.1;bpy.context.scene.camera=o
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False;scene.view_settings.view_transform='AgX';scene.render.filepath=str(ARC/'diver-preview.png');bpy.ops.render.render(write_still=True)
