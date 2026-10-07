"""Two independent tailored garments on the complete archived CC0 mannequin.
Body topology remains complete; no runtime masks/hidden body parts are used.
Garment shells have independent continuous loft/fused topology and transferred skins.
"""
import bpy,bmesh,math,json,struct
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.kdtree import KDTree
ROOT=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris')
ARC=ROOT/'assets/fitting-source-archives'
OUT=ROOT/'web/fitting/assets'
SRC=ROOT/'assets/diver-source-archives/original'
ARC.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(next((SRC/'quaternius-ual').rglob('*.glb'))))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');body=bpy.data.objects['Mannequin'];body.name='Fitting_Avatar_CompleteBody'
rig.name='Fitting_Rig_53'
rig.animation_data_clear()
for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
source_vertices=[list(v.co)for v in body.data.vertices];source_faces=[list(p.vertices)for p in body.data.polygons]
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
bpy.ops.object.select_all(action='DESELECT')
def mat(name,col,rough=.75,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
skin=mat('Fitting_Avatar_WarmGrey',(.45,.43,.38),.78)
pants=mat('Fitting_Avatar_IntegralBase',(.043,.066,.071),.87)
fabric=mat('Fitting_Fabric',(.54,.62,.40),.83)
rib=mat('Fitting_Trim',(.19,.26,.18),.94)
stitch=mat('Fitting_Stitch',(.80,.80,.65),.8)
metal=mat('Fitting_Hardware',(.26,.30,.27),.3,.7)
body.data.materials.clear();body.data.materials.append(skin);body.data.materials.append(pants)
for p in body.data.polygons:p.use_smooth=True;p.material_index=int(p.center.z<1.015)
source_groups={g.index:g.name for g in body.vertex_groups}
kd=KDTree(len(body.data.vertices))
for v in body.data.vertices:kd.insert(v.co,v.index)
kd.balance()
garments={}
active_shell=None
def skin_new(o,material):
 o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 for name in source_groups.values():o.vertex_groups.new(name=name)
 for v in o.data.vertices:
  # Continuous clothing weights blend over real chest/shoulder/upperarm/elbow bones.
  # Copying nearest mannequin hinge caps would tear a continuous collar/yoke.
  x=abs(v.co.x);z=v.co.z;side='L' if v.co.x>0 else 'R';weights={}
  if z>1.39:torso='DEF-spine.003'
  elif z>1.22:torso='DEF-spine.002'
  elif z>1.07:torso='DEF-spine.001'
  else:torso='DEF-hips'
  arm=max(0,min(1,(x-.19)/.09))
  if x<.28:arm*=max(0,min(1,(z-1.33)/.08))
  if x<.125:arm=0
  elbow=max(0,min(1,(x-.421)/.090))
  weights[torso]=1-arm
  if arm:
   nearest={}
   for co,idx,d in kd.find_n(v.co,4):
    f=1/max(d*d,1e-8)
    for g in body.data.vertices[idx].groups:nearest[source_groups[g.group]]=nearest.get(source_groups[g.group],0)+g.weight*f
   totalNear=sum(nearest.values())
   for name,w in nearest.items():weights[name]=weights.get(name,0)+arm*w/totalNear
  weights=dict(sorted(weights.items(),key=lambda p:p[1],reverse=True)[:4]);total=sum(weights.values())
  for name,w in weights.items():
   if w/total>1e-5:o.vertex_groups[name].add([v.index],w/total,'REPLACE')
 mod=o.modifiers.new('Complete shared 53-bone skin','ARMATURE');mod.object=rig;o.parent=rig
 return o
def mesh(name,verts,faces,material):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);return skin_new(o,material)
def tube(name,points,radius,material):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=3;d.bevel_depth=radius;d.bevel_resolution=2
 s=d.splines.new('POLY');s.points.add(len(points)-1)
 for p,co in zip(s.points,points):p.co=(*co,1)
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False);return skin_new(o,material)
def surface_y(x,z,back=False):
 if active_shell:
  start=Vector((x,1 if back else -1,z));direction=Vector((0,-1 if back else 1,0));hit,co,normal,idx=active_shell.ray_cast(start,direction)
  if hit:return co.y
 # Fallback for tailoring outside the continuous shell.
 hits=[]
 for v in body.data.vertices:
  if abs(v.co.x-x)<.032 and abs(v.co.z-z)<.032:hits.append(v.co.y)
 return (max(hits) if back else min(hits)) if hits else (.10 if back else -.12)
def front_points(points,offset=.027,back=False):
 return [(x,surface_y(x,z,back)+(offset*.28 if back else -offset*.28),z)for x,z in points]
def seam_points(points,offset=.035,back=False):
 dense=[]
 for a,b in zip(points,points[1:]):
  n=max(1,int(math.hypot(b[0]-a[0],b[1]-a[1])/.004)+1)
  dense.extend([(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n)for i in range(n)])
 dense.append(points[-1]);return front_points(dense,offset,back)
def panel(name,outline,offset,material):
 # Dense independent curved panel, every vertex projected to current garment.
 # A coarse fan bridges across convex cloth and would bury the pocket interior.
 xmin=min(p[0]for p in outline);xmax=max(p[0]for p in outline);zmin=min(p[1]for p in outline);zmax=max(p[1]for p in outline)
 nx=14;nz=12;verts=front_points([(xmin+(xmax-xmin)*i/nx,zmin+(zmax-zmin)*j/nz)for j in range(nz+1)for i in range(nx+1)],offset)
 faces=[]
 def inside(x,z):
  flag=False
  for a,b in zip(outline,outline[1:]+outline[:1]):
   if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:flag=not flag
  return flag
 for j in range(nz):
  for i in range(nx):
   x=xmin+(xmax-xmin)*(i+.5)/nx;z=zmin+(zmax-zmin)*(j+.5)/nz
   if inside(x,z):k=j*(nx+1)+i;faces.append((k,k+1,k+nx+2,k+nx+1))
 return mesh(name,verts,faces,material)
def shell(sku,hem,cuff,neck,offset):
 global active_shell
 # Independent full torso, rounded shoulder yoke and two tapered sleeves.
 # A continuous union creates sleeves/underarms rather than copying source hinge gaps.
 verts=[];faces=[];N=64
 extra=.013 if sku=='jacket-01' else 0
 profiles=[(hem-.024,.183+extra,.154+extra,.008),(1.055,.172+extra,.151+extra,.008),(1.16,.174+extra,.153+extra,.012),(1.26,.187+extra,.171+extra,.008),(1.355,.214+extra,.188+extra,.009),(1.428,.220+extra,.182+extra,.016),(1.485,.212+extra,.168+extra,.012),(neck+.02,.201+extra,.153+extra,.008)]
 for z,rx,ry,cy in profiles:
  for j in range(N):
   a=2*math.pi*j/N;power=1 if z>1.50 else .55
   c=math.cos(a);s=math.sin(a);verts.append((rx*math.copysign(abs(c)**power,c),cy+ry*math.copysign(abs(s)**power,s),z))
 for i in range(len(profiles)-1):
  for j in range(N):a=i*N+j;b=i*N+(j+1)%N;faces.append((a,b,b+N,a+N))
 faces.append(tuple(range(N-1,-1,-1)));faces.append(tuple((len(profiles)-1)*N+j for j in range(N)))
 for sign in [-1,1]:
  rings=[(.13,.133+extra),(.22,.135+extra),(.32,.118+extra),(.405,.104+extra)]
  if cuff>.5:rings.extend([(.475,.097),(.56,.090),(.64,.081),(.744,.074)])
  else:rings.append((cuff+.022,.103))
  base=len(verts)
  for x,r in rings:
   for j in range(N):
    a=2*math.pi*j/N;verts.append((sign*x,.067+r*math.sin(a),1.4408+r*math.cos(a)))
  for i in range(len(rings)-1):
   for j in range(N):a=base+i*N+j;b=base+i*N+(j+1)%N;faces.append((a,b,b+N,a+N) if sign==1 else (a+N,b+N,b,a))
  faces.append(tuple(base+j for j in range(N-1,-1,-1)));faces.append(tuple(base+(len(rings)-1)*N+j for j in range(N)))
 d=bpy.data.meshes.new(sku+'_continuous_cut');d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(sku+'_garment_main',d);bpy.context.collection.objects.link(o)
 bm=bmesh.new();bm.from_mesh(d);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(d);bm.free()
 bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=o;o.select_set(True)
 sub=o.modifiers.new('Continuous tailored loft curvature','SUBSURF');sub.levels=2;sub.render_levels=2;bpy.ops.object.modifier_apply(modifier=sub.name)
 rem=o.modifiers.new('Continuous tailored torso shoulder underarm union','REMESH');rem.mode='VOXEL';rem.voxel_size=.007;rem.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rem.name)
 smooth=o.modifiers.new('Smooth cloth loft','SMOOTH');smooth.factor=.45;smooth.iterations=12;bpy.ops.object.modifier_apply(modifier=smooth.name)
 bm=bmesh.new();bm.from_mesh(o.data)
 for co,no in [((0,0,hem),(0,0,-1)),((cuff,0,0),(1,0,0)),((-cuff,0,0),(-1,0,0))]:
  bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=Vector(co),plane_no=Vector(no),clear_outer=True,clear_inner=False)
 # Neck cut only touches the circular neck chimney, never the raised sleeve crown.
 for f in list(bm.faces):
  c=f.calc_center_median()
  if c.z>neck-.004 and (c.x/.091)**2+((c.y-.008)/.099)**2<1:bmesh.ops.delete(bm,geom=[f],context='FACES')
 bm.normal_update();bm.to_mesh(o.data);bm.free();o.data.update()
 # Trim follows the actual connected boundaries of the independently made shirt.
 bm=bmesh.new();bm.from_mesh(o.data);remaining=set(e for e in bm.edges if e.is_boundary);loops=[]
 while remaining:
  first=next(iter(remaining));remaining.remove(first);chain=[first.verts[0],first.verts[1]]
  while chain[-1]!=chain[0]:
   choices=[e for e in chain[-1].link_edges if e in remaining]
   if not choices:break
   edge=choices[0];remaining.remove(edge);chain.append(edge.other_vert(chain[-1]))
  if len(chain)>8:loops.append([tuple(v.co)for v in chain])
 bm.free()
 sol=o.modifiers.new('Actual sewn shell thickness','SOLIDIFY');sol.thickness=.0022;sol.offset=-.3;bpy.ops.object.modifier_apply(modifier=sol.name);o.select_set(False)
 skin_new(o,fabric);parts=[o];active_shell=o
 for index,points in enumerate(loops):
  parts.append(tube(sku+'_garment_trim_cut_edge_'+str(index),points,.0039,rib))
 return parts
tee=shell('tee-01',1.00,.405,1.508,.019)
tee.append(panel('tee-01_garment_main_chest_pocket',[(-.147,1.335),(-.045,1.335),(-.045,1.255),(-.060,1.234),(-.132,1.234),(-.147,1.255)],.033,fabric))
tee.append(tube('tee-01_garment_stitch_pocket',seam_points([(-.145,1.332),(-.145,1.257),(-.130,1.239),(-.062,1.239),(-.050,1.257),(-.050,1.332)],.045),.0014,stitch))
tee.append(tube('tee-01_garment_trim_shoulder_L',seam_points([(.072,1.459),(.130,1.453),(.184,1.433)],.041),.0021,rib))
tee.append(tube('tee-01_garment_trim_shoulder_R',seam_points([(-.072,1.459),(-.130,1.453),(-.184,1.433)],.041),.0021,rib))
garments['tee-01']=tee
jacket=shell('jacket-01',.975,.718,1.532,.028)
# Curved continuous center front placket and metallic zipper, each independently skinned.
zs=[.989+i*.012 for i in range(44)]
left=front_points([(-.020,z)for z in zs],.047);right=front_points([(.020,z)for z in zs],.047)
verts=left+right;n=len(zs);jacket.append(mesh('jacket-01_garment_trim_front_placket',verts,[(i,i+1,n+i+1,n+i)for i in range(n-1)],rib))
jacket.append(tube('jacket-01_garment_hardware_zipper',front_points([(0,z)for z in zs],.052),.0029,metal))
for sign in [-1,1]:
 for i,z in enumerate(zs[2:-2]):
  x=sign*.005;pts=front_points([(x,z),(sign*.009,z)],.053)
  jacket.append(tube('jacket-01_garment_hardware_zip_tooth_'+str(sign)+'_'+str(i),pts,.0014,metal))
 jacket.append(panel('jacket-01_garment_main_chest_pocket_'+str(sign),[(sign*x,z)for x,z in [(.055,1.36),(.154,1.36),(.154,1.29),(.140,1.275),(.068,1.275),(.055,1.29)]],.044,fabric))
 jacket.append(panel('jacket-01_garment_trim_chest_flap_'+str(sign),[(sign*x,z)for x,z in [(.052,1.365),(.157,1.365),(.157,1.342),(.052,1.342)]],.050,rib))
 jacket.append(tube('jacket-01_garment_trim_hand_pocket_'+str(sign),seam_points([(sign*.074,1.10),(sign*.152,1.184)],.043),.005,rib))
 jacket.append(tube('jacket-01_garment_stitch_side_seam_'+str(sign),seam_points([(sign*.155,z)for z in [1.015,1.08,1.15,1.22,1.28]],.042),.0017,stitch))
 # Button/zip pull detail is a small shaped fabric-metal loop, not painted marks.
 pts=front_points([(sign*.098,1.35),(sign*.098,1.34)],.059);jacket.append(tube('jacket-01_garment_hardware_chest_snap_'+str(sign),pts,.0042,metal))
jacket.append(tube('jacket-01_garment_hardware_zip_pull',front_points([(0,1.487),(.01,1.478),(.008,1.461),(0,1.460),(0,1.487)],.056),.0027,metal))
jacket.append(tube('jacket-01_garment_trim_back_yoke',seam_points([(-.16,1.384),(-.08,1.397),(0,1.403),(.08,1.397),(.16,1.384)],.045,True),.0032,rib))
garments['jacket-01']=jacket
# Batch the entire geometric zip teeth without deleting triangles or detail.
teeth=[o for o in jacket if '_zip_tooth_' in o.name]
bpy.ops.object.select_all(action='DESELECT')
for o in teeth:o.select_set(True)
bpy.context.view_layer.objects.active=teeth[0];bpy.ops.object.join();teeth[0].name='jacket-01_garment_hardware_zip_teeth'
jacket[:]=[o for o in jacket if o not in teeth]+[teeth[0]]
bpy.ops.object.select_all(action='DESELECT')

# Fixed finite registered poses, both feet kept on the ground; clothes share each actual arm bone.
def point_bone(name,direction):
 pb=rig.pose.bones[name];base=pb.bone.matrix_local;axis=base.to_3x3().col[1].normalized();q=axis.rotation_difference(Vector(direction).normalized());m=q.to_matrix().to_4x4()@base;m.translation=pb.head;pb.matrix=m;bpy.context.view_layer.update()
def pose(kind):
 for p in rig.pose.bones:p.matrix_basis=Matrix.Identity(4);p.rotation_mode='QUATERNION'
 bpy.context.view_layer.update()
 for side,sign in [('L',1),('R',-1)]:
  if kind=='neutral':
   point_bone('DEF-upper_arm.'+side,(sign*.105,.003,-.26));point_bone('DEF-forearm.'+side,(sign*.036,-.018,-.27));point_bone('DEF-hand.'+side,(sign*.01,-.01,-.11))
  else:
   point_bone('DEF-upper_arm.'+side,(sign*.255,-.016,-.11));point_bone('DEF-forearm.'+side,(sign*.23,-.037,-.13));point_bone('DEF-hand.'+side,(sign*.08,-.026,-.08))
 bpy.context.view_layer.update()
 return {p.name:(p.location.copy(),p.rotation_quaternion.copy(),p.scale.copy())for p in rig.pose.bones}
poses={p:pose(p)for p in ['neutral','reach']}
bpy.context.scene.render.fps=30
for kind,values in poses.items():
 action=bpy.data.actions.new('Fitting_'+kind.title());rig.animation_data_create();rig.animation_data.action=action
 for frame in [0,60]:
  for p in rig.pose.bones:
   p.location,p.rotation_quaternion,p.scale=values[p.name]
   for field in ['location','rotation_quaternion','scale']:p.keyframe_insert(field,frame=frame)
 rig.animation_data.action=None;track=rig.animation_data.nla_tracks.new();track.name=action.name;strip=track.strips.new(action.name,0,action);track.mute=True
rig.animation_data.action=bpy.data.actions['Fitting_Neutral'];bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
def evaluated_points(objs):
 dg=bpy.context.evaluated_depsgraph_get();res=[]
 for o in objs:
  e=o.evaluated_get(dg);m=e.to_mesh();res.extend(e.matrix_world@v.co for v in m.vertices);e.to_mesh_clear()
 return res
points=evaluated_points([body]);minimum=min(p.z for p in points);maximum=max(p.z for p in points);scale=1.78/(maximum-minimum)
# Blender -Y is human front and maps directly to glTF +Z under Y-up export.
anchor=bpy.data.objects.new('Fitting_Fixed_178_Reference',None);bpy.context.collection.objects.link(anchor);anchor.scale=(scale,scale,scale);anchor.location.z=-minimum*scale;rig.parent=anchor;body.parent=rig
assert source_vertices==[list(v.co)for v in body.data.vertices];assert source_faces==[list(p.vertices)for p in body.data.polygons]
report={'schema':1,'date':'2026-10-05','purpose':'Complete fixed virtual reference avatar and two independent tailored garments; finite neutral/reach fit only, no real-size prediction or cloth solver','sourceBody':{'vertices':len(source_vertices),'uniqueTriangles':len(source_faces),'bones':len(rig.data.bones)},'virtualReferenceHeight':1.78,'scale':scale,'groundOffset':-minimum*scale,'up':'+Y','front':'+Z','runtimeOuterScale':1,'bodyMasks':False,'poses':['neutral','reach'],'clips':['Fitting_Neutral','Fitting_Reach'],'garments':[]}
for sku,parts in garments.items():report['garments'].append({'id':sku,'meshCount':len(parts),'triangleCount':sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in parts),'independentShell':parts[0].name,'thickness':.0022,'construction':'continuous original torso/shoulder/sleeve loft, full union, conservative registered ease'})
(OUT/'fit-registration.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ARC/'atelier-fitting-complete.blend'))
def export(file,meshes):
 bpy.ops.object.select_all(action='DESELECT')
 for o in [anchor,rig]+meshes:o.select_set(True)
 bpy.context.view_layer.objects.active=rig
 bpy.ops.export_scene.gltf(filepath=str(OUT/file),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_skins=True,export_morph=False,export_cameras=False,export_lights=False,export_apply=False)
 packed=(OUT/file).read_bytes();size=struct.unpack_from('<I',packed,12)[0];gltf=json.loads(packed[20:20+size]);binary=packed[28+size:]
 clip=next(c for c in gltf['animations']if c['name']=='Fitting_Neutral')
 for channel in clip['channels']:
  a=gltf['accessors'][clip['samplers'][channel['sampler']]['output']];v=gltf['bufferViews'][a['bufferView']];w={'VEC3':3,'VEC4':4}[a['type']];values=list(struct.unpack_from('<'+'f'*w,binary,v.get('byteOffset',0)+a.get('byteOffset',0)));gltf['nodes'][channel['target']['node']][channel['target']['path']]=values
 js=json.dumps(gltf,separators=(',',':')).encode();js+=b' '*((-len(js))%4);payload=struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary;(OUT/file).write_bytes(struct.pack('<III',0x46546c67,2,len(payload)+12)+payload)
export('avatar.glb',[body]);export('core-tee.glb',garments['tee-01']);export('field-jacket.glb',garments['jacket-01'])
print('FITTING_REPORT',json.dumps(report))

# Authoring visual review renders are outside published runtime.
for o in garments['jacket-01']:o.hide_render=False
for o in garments['tee-01']:o.hide_render=True
world=bpy.data.worlds.new('Fitting review environment');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.32,.35,.31,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45;bpy.context.scene.world=world
def area(name,loc,power,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
area('Softbox key',(-2,-3,3),350,3);area('Softbox rim',(2,2,2.5),350,2)
cam=bpy.data.cameras.new('Asset review camera');o=bpy.data.objects.new('Asset review camera',cam);bpy.context.collection.objects.link(o);o.location=(2,-4,2.15);o.rotation_euler=(Vector((0,0,.88))-o.location).to_track_quat('-Z','Y').to_euler();cam.type='ORTHO';cam.ortho_scale=2.05;bpy.context.scene.camera=o
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.render.film_transparent=False
for sku in ['jacket-01','tee-01']:
 for key,parts in garments.items():
  for part in parts:part.hide_render=key!=sku
 for kind in ['neutral','reach']:
  rig.animation_data.action=bpy.data.actions['Fitting_'+kind.title()];scene.frame_set(0);scene.render.filepath=str(ARC/(sku+'-'+kind+'-preview.png'));bpy.ops.render.render(write_still=True)
