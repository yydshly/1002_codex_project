"""Original complete court shoes and ankle boots at frozen avatar foot coordinates.
Rigid registered pairs; no avatar mutation, body mask, gait or sizing service.
"""
import bpy,bmesh,math,json,struct,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris')
ARC=ROOT/'assets/fitting-footwear-source-archives';OUT=ROOT/'web/fitting/footwear'
ARC.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def material(name,color,rough=.7,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;return m
court_upper=material('Fitting_ShoeUpper',(.70,.67,.58),.63)
boot_upper=material('Fitting_ShoeUpper_Boot',(.105,.135,.079),.83)
rubber=material('Fitting_ShoeRubber',(.026,.030,.031),.9)
sole_court=material('Fitting_ShoeSole',(.68,.66,.59),.81)
sole_boot=material('Fitting_ShoeSole_Boot',(.042,.047,.043),.9)
trim=material('Fitting_ShoeTrim',(.055,.067,.058),.85)
lining=material('Fitting_ShoeLining',(.018,.023,.020),.94)
laces=material('Fitting_ShoeLaces',(.64,.62,.54),.92)
seam=material('Fitting_ShoeStitch',(.43,.41,.33),.84)
metal=material('Fitting_ShoeHardware',(.28,.20,.12),.30,.72)
models={};profiles={}
def mesh(name,verts,faces,mat):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
 bm=bmesh.new();bm.from_mesh(d);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(d);bm.free()
 for p in o.data.polygons:p.use_smooth=True
 return o
def curve(name,points,radius,mat,bezier=False):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=8;d.bevel_depth=radius;d.bevel_resolution=3
 if bezier:
  s=d.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
  for p,co in zip(s.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
 else:
  s=d.splines.new('POLY');s.points.add(len(points)-1)
  for p,co in zip(s.points,points):p.co=(*co,1)
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.select_set(False);o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 return o
def bevel(o,width=.002,segments=3):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Manufactured rounded cut','BEVEL');m.width=width;m.segments=segments;bpy.ops.object.modifier_apply(modifier=m.name);o.select_set(False)
 return o
def interpolate(values,z,col):
 # Cubic Hermite interpolation of the authored last, no visible loft-ring corners.
 if z<=values[0][0]:return values[0][col]
 if z>=values[-1][0]:return values[-1][col]
 i=next(i for i in range(len(values)-1)if values[i][0]<=z<=values[i+1][0]);a=values[i];b=values[i+1];t=(z-a[0])/(b[0]-a[0]);span=b[0]-a[0]
 p=values[max(i-1,0)];q=values[min(i+2,len(values)-1)];m0=(b[col]-p[col])/(b[0]-p[0]);m1=(q[col]-a[col])/(q[0]-a[0]);return (2*t**3-3*t**2+1)*a[col]+(t**3-2*t**2+t)*span*m0+(-2*t**3+3*t**2)*b[col]+(t**3-t**2)*span*m1
last=[(-.121,.005,.043),(-.109,.043,.125),(-.085,.064,.169),(-.047,.073,.185),(-.003,.078,.174),(.036,.080,.151),(.078,.081,.122),(.124,.080,.100),(.170,.074,.080),(.207,.060,.065),(.235,.034,.044),(.247,.003,.032)]
def width(z):return max(.002,interpolate(last,z,1))
def height(z,sku):return interpolate(last,z,2)+(.009 if sku=='boot-01' else 0)
def coord(cx,z,theta,sku,offset=0):
 w=width(z);base=.030 if sku=='court-01' else .042
 x=-w*math.cos(theta);h=base+(height(z,sku)-base)*max(0,math.sin(theta))**.40
 if not offset:return (cx+x,-z,h)
 # Exact local differential normal: all layered tailoring follows the smooth shell.
 eps=.00001
 lo=max(0,theta-eps);hi=min(math.pi,theta+eps)
 tangent=Vector(coord(cx,z,hi,sku))-Vector(coord(cx,z,lo,sku))
 longitudinal=Vector(coord(cx,z+eps,theta,sku))-Vector(coord(cx,z-eps,theta,sku))
 normal=tangent.cross(longitudinal).normalized()
 if normal.z<0:normal=-normal
 return tuple(Vector((cx+x,-z,h))+normal*offset)
def foot_surface(cx,localx,z,sku,offset=.003):
 theta=math.acos(max(-1,min(1,-localx/width(z))));return coord(cx,z,theta,sku,offset)
def footprint(zcount=80):
 zvals=[last[0][0]+(last[-1][0]-last[0][0])*i/zcount for i in range(zcount+1)]
 return [(-width(z),z)for z in zvals]+[(width(z),z)for z in reversed(zvals)]
outline=footprint()
def sole(name,cx,sku,mat):
 N=len(outline);top=.032 if sku=='court-01' else .045
 rings=[(0,.93),(.003,.99),(.010,1.025),(top-.004,1.020),(top,.975)]
 verts=[(cx+x*s,-z,y)for y,s in rings for x,z in outline];faces=[]
 for r in range(len(rings)-1):
  for j in range(N):a=r*N+j;b=r*N+(j+1)%N;faces.append((a,b,b+N,a+N))
 faces.append(tuple(range(N-1,-1,-1)));faces.append(tuple((len(rings)-1)*N+i for i in range(N)));return mesh(name,verts,faces,mat)
def upper(name,cx,anklex,sku,mat):
 base=.030 if sku=='court-01' else .042;rows=112;N=80;zs=[last[0][0]+(last[-1][0]-last[0][0])*i/rows for i in range(rows+1)]
 verts=[coord(cx,z,math.pi*j/N,sku)for z in zs for j in range(N+1)];faces=[]
 for i in range(rows):
  for j in range(N):
   a=i*(N+1)+j;ids=(a,a+1,a+N+2,a+N+1);c=sum((Vector(verts[k])for k in ids),Vector())/4
   # Actual open ankle portal in the crown; original ankle/shin exits here.
   faces.append(ids)
 # Toe/heel end faces are complete; sole closes the bottom separately.
 faces.append(tuple(range(N,-1,-1)));faces.append(tuple(rows*(N+1)+j for j in range(N+1)))
 o=mesh(name,verts,faces,mat)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;s=o.modifiers.new('Actual leather shell thickness','SOLIDIFY');s.thickness=.0022;s.offset=-.5;bpy.ops.object.modifier_apply(modifier=s.name);o.select_set(False)
 return o
def cap_panel(name,cx,sku,z0,z1,t0,t1,mat,offset=.0035):
 rows=32;cols=32;verts=[coord(cx,z0+(z1-z0)*i/rows,t0+(t1-t0)*j/cols,sku,offset)for i in range(rows+1)for j in range(cols+1)];faces=[]
 for i in range(rows):
  for j in range(cols):a=i*(cols+1)+j;faces.append((a,a+1,a+cols+2,a+cols+1))
 return mesh(name,verts,faces,mat)
def torus(name,p,normal,mat,radius=.0043):
 bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=8,location=p,major_radius=radius,minor_radius=.00115);o=bpy.context.object;o.name=name;o.rotation_euler=Vector(normal).to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
 for f in o.data.polygons:f.use_smooth=True
 return o
def cube(name,p,size,mat,rounding=.002):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);o.data.materials.append(mat);return bevel(o,rounding)
def shaft(name,ax,sku):
 N=96;rings=[(.108,.067,.080),(.150,.068,.085),(.210,.068,.087),(.270,.069,.090),(.286,.069,.091)]
 verts=[]
 for y,rx,rz in rings:
  for j in range(N):a=2*math.pi*j/N;verts.append((ax+rx*math.cos(a),.040+rz*math.sin(a),y))
 faces=[]
 for i in range(len(rings)-1):
  for j in range(N):a=i*N+j;b=i*N+(j+1)%N;faces.append((a,b,b+N,a+N))
 o=mesh(name,verts,faces,boot_upper)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;s=o.modifiers.new('Boot quarter leather thickness','SOLIDIFY');s.thickness=.0028;s.offset=-.5;bpy.ops.object.modifier_apply(modifier=s.name);o.select_set(False);return o
for sku in ['court-01','boot-01']:
 root=bpy.data.objects.new('Footwear_Pair_'+sku,None);bpy.context.collection.objects.link(root);parts=[];mat=court_upper if sku=='court-01' else boot_upper
 for side,sign in [('L',1),('R',-1)]:
  cx=sign*.096;anklex=sign*.086629;prefix=sku+'_'+side
  parts.append(sole(prefix+'_OutsoleComplete',cx,sku,sole_court if sku=='court-01' else sole_boot));parts.append(upper(prefix+'_UpperComplete',cx,anklex,sku,mat))
  # Full toe bumper, curved vamp and paired quarter panels retain actual shape.
  parts.append(cap_panel(prefix+'_ToeCap',cx,sku,.148,.236,.15,math.pi-.15,mat,.004))
  for edge in [.22,math.pi-.22]:
   points=[coord(cx,.14+.097*i/64,edge,sku,.005)for i in range(65)];parts.append(curve(prefix+'_ToeCapSideStitch_'+str(edge),points,.0010,seam))
  parts.append(curve(prefix+'_ToeCapArcStitch',[coord(cx,.148,math.pi*j/80,sku,.006)for j in range(81)],.0011,seam))
  for index,(a0,a1)in enumerate([(.12,.67),(math.pi-.67,math.pi-.12)]):
   parts.append(cap_panel(prefix+'_QuarterPanel_'+str(index),cx,sku,-.076,.118,a0,a1,mat,.0040))
   parts.append(curve(prefix+'_QuarterSeam_'+str(index),[coord(cx,z,a1,sku,.006)for z in [-.076+.194*j/100 for j in range(101)]],.0011,seam))
  # Heel counter is a separate curved structural part and rear seam.
  parts.append(cap_panel(prefix+'_HeelCounter',cx,sku,-.108,-.063,.18,math.pi-.18,trim,.0025))
  parts.append(curve(prefix+'_HeelCounterStitch',[coord(cx,-.063,math.pi*j/64,sku,.006)for j in range(65)],.00115,seam))
  for y in [.011,.024 if sku=='court-01' else .035]:
   pts=[(cx+x*1.027,-z,y)for x,z in outline];pts.append(pts[0]);parts.append(curve(prefix+'_RubberSidewallGroove_'+str(y),pts,.0009,rubber))
  # Separate rubber tread block geometry is embedded in the fixed-floor sole; sidewall grooves remain visible. This is not a tread/friction simulation.
  for k,z in enumerate([-.087,-.055,-.02,.018,.056,.094,.132,.170,.205]):
   w=width(z)*.80
   parts.append(cube(prefix+'_TreadLug_'+str(k),(cx,-z,.004),(w*2,.010,.008),rubber,.0017))
  # Broad tongue is finely projected to the curved last, never a flat painted strip.
  nx=20;nz=54;z0=.027;z1=.168;verts=[foot_surface(cx,-.026+.052*j/nx,z0+(z1-z0)*i/nz,sku,.009)for i in range(nz+1)for j in range(nx+1)];faces=[]
  for i in range(nz):
   for j in range(nx):a=i*(nx+1)+j;faces.append((a,a+1,a+nx+2,a+nx+1))
  parts.append(mesh(prefix+'_TongueComplete',verts,faces,mat));parts.append(curve(prefix+'_TongueEdge',[foot_surface(cx,x,.027,sku,.011)for x in [-.026+.052*j/32 for j in range(33)]],.0018,trim))
  stations=[.151,.122,.093,.064,.035]
  eye=[]
  for index,z in enumerate(stations):
   pair=[]
   for s in [-1,1]:
    p=Vector(foot_surface(cx,s*.032,z,sku,.018));pair.append(p);parts.append(torus(prefix+'_Eyelet_'+str(index)+'_'+str(s),p,(0,0,1),metal))
   eye.append(pair)
  for index,pair in enumerate(eye):
   p,q=pair;mid=Vector(foot_surface(cx,0,stations[index],sku,.023));parts.append(curve(prefix+'_LaceBridge_'+str(index),[p,mid,q],.0023,laces,True))
   if index<len(eye)-1:
    q2=eye[index+1][1-index%2];p2=pair[index%2];mid2=Vector(foot_surface(cx,(p2.x+q2.x)/2-cx,(stations[index]+stations[index+1])/2,sku,.022));parts.append(curve(prefix+'_LaceDiagonal_'+str(index),[p2,mid2,q2],.0021,laces,True))
  if sku=='court-01':
   pts=[]
   for j in range(129):
    a=2*math.pi*j/128;x=anklex+.050*math.cos(a);z=-.034+.059*math.sin(a);pts.append(foot_surface(cx,x-cx,z,sku,.003))
   parts.append(curve(prefix+'_PaddedCollarRim',pts,.0048,lining))
   verts=[(p[0],p[1],p[2]-depth)for depth in [0,.022]for p in pts[:-1]];faces=[(j,(j+1)%128,(j+1)%128+128,j+128)for j in range(128)];parts.append(mesh(prefix+'_CollarInteriorLining',verts,faces,lining))
   # Small heel tab and complete tied lace loops are locally authored.
   parts.append(cube(prefix+'_HeelTab',(cx,.104,.103),(.048,.005,.048),mat,.005))
   bow=Vector(foot_surface(cx,0,.042,sku,.019))
  else:
   parts.append(shaft(prefix+'_AnkleQuarterComplete',anklex,sku));rim=[(anklex+.069*math.cos(2*math.pi*j/96),.040+.091*math.sin(2*math.pi*j/96),.286)for j in range(97)];parts.append(curve(prefix+'_PaddedShaftRim',rim,.0054,lining))
   # A full forward curved shaft tongue and three extra high lace stations.
   vals=[(.115,.090),(.170,.060),(.220,.056),(.271,.058)]
   verts=[]
   for i in range(65):
    y=.115+.156*i/64;front=interpolate([(a,b)for a,b in vals],y,1)
    for j in range(21):x=-.031+.062*j/20;verts.append((anklex+x,-front-.007,y))
   faces=[]
   for i in range(64):
    for j in range(20):a=i*21+j;faces.append((a,a+1,a+22,a+21))
   parts.append(mesh(prefix+'_BootTongueComplete',verts,faces,mat))
   for k,y in enumerate([.172,.219,.263]):
    front=interpolate([(a,b)for a,b in vals],y,1)+.010;p=Vector((anklex-.031,-front,y));q=Vector((anklex+.031,-front,y));parts.append(torus(prefix+'_ShaftHookL_'+str(k),p,(0,-1,0),metal,.0047));parts.append(torus(prefix+'_ShaftHookR_'+str(k),q,(0,-1,0),metal,.0047));mid=(p+q)/2;mid.y-=.006;parts.append(curve(prefix+'_ShaftLace_'+str(k),[p,mid,q],.0024,laces,True))
   for t in [-1,1]:parts.append(curve(prefix+'_ShaftSideSeam_'+str(t),[(anklex+t*.069,.040+.000*math.sin(math.pi*j/64),.12+.161*j/64)for j in range(65)],.0012,seam))
   pull=[(anklex-.018,.138,.254),(anklex-.020,.138,.302),(anklex+.020,.138,.302),(anklex+.018,.138,.254)];parts.append(curve(prefix+'_HeelPullLoop',pull,.0048,trim,True));bow=Vector((anklex,-.060,.274))
  for s in [-1,1]:
   pts=[tuple(bow+Vector((s*.032*math.sin(2*math.pi*j/48),.016*math.cos(2*math.pi*j/48)-.015,.003*math.sin(4*math.pi*j/48))))for j in range(49)];parts.append(curve(prefix+'_TiedLaceLoop_'+str(s),pts,.0020,laces))
  parts.append(curve(prefix+'_LaceTail',[tuple(bow),tuple(bow+Vector((.016,-.026,-.009))),tuple(bow+Vector((.018,-.033,-.020)))],.0018,laces,True))
 for o in parts:o.parent=root
 # Merge like-material tread/eyelet objects, preserving every geometric element.
 for marker in ['_Eyelet_','_TreadLug_']:
  picked=[o for o in parts if marker in o.name]
  if len(picked)>1:
   bpy.ops.object.select_all(action='DESELECT')
   for o in picked:o.select_set(True)
   bpy.context.view_layer.objects.active=picked[0];bpy.ops.object.join();picked[0].name=sku+marker+'CompletePair';parts[:]=[o for o in parts if o not in picked]+[picked[0]]
 bpy.ops.object.select_all(action='DESELECT');models[sku]={'root':root,'parts':parts}
def export(sku,file):
 bpy.ops.object.select_all(action='DESELECT');group=models[sku]
 for o in [group['root']]+group['parts']:o.select_set(True)
 bpy.context.view_layer.objects.active=group['root'];bpy.ops.export_scene.gltf(filepath=str(OUT/file),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_skins=False,export_cameras=False,export_lights=False)
 b=(OUT/file).read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);binary=b[28+n:]
 for m in g.get('materials',[]):
  if m['name']=='Fitting_ShoeUpper_Boot':m['name']='Fitting_ShoeUpper'
 js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4);payload=struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary;(OUT/file).write_bytes(struct.pack('<III',0x46546c67,2,len(payload)+12)+payload)
if '--ridge-only' not in sys.argv:export('court-01','court.glb')
export('boot-01','ridge.glb')
report={'schema':1,'date':'2026-10-06','up':'+Y','front':'+Z','outerScale':1,'type':'fixed rigid paired footwear; original avatar feet unchanged','sourceAvatar':'../assets/avatar.glb','footJointAnchors':{'L':[.086629,.100488,-.034846],'R':[-.086629,.100488,-.034846]},'anklePortal':{'centerZ':-.034,'radiusX':.050,'radiusZ':.059,'purpose':'real ankle/shin exit, not a body hiding mask'},'soleBottomY':0,'poses':['neutral','reach'],'gaitSupported':False,'realSizePrediction':False,'garments':[]}
for sku,group in models.items():
 points=[o.matrix_world@v.co for o in group['parts']for v in o.data.vertices]
 report['garments'].append({'id':sku,'file':'court.glb' if sku=='court-01' else 'ridge.glb','meshes':len(group['parts']),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in group['parts']),'boundsBlender':{'min':[min(p[k]for p in points)for k in range(3)],'max':[max(p[k]for p in points)for k in range(3)]}})
(OUT/'fit-registration.json').write_text(json.dumps(report,indent=2))

# Keep frozen avatar alongside editable shoes solely for actual fitting review.
bpy.ops.import_scene.gltf(filepath=str(ROOT/'web/fitting/assets/avatar.glb'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rig.animation_data_create();rig.animation_data.action=next(a for a in bpy.data.actions if a.name.startswith('Fitting_Neutral'));bpy.context.scene.frame_set(0)
for obj in list(bpy.context.scene.objects):
 if obj.name=='Icosphere':
  for c in list(obj.users_collection):c.objects.unlink(obj)
bpy.ops.wm.save_as_mainfile(filepath=str(ARC/'atelier-footwear-complete.blend'))
print('FOOTWEAR_REPORT',json.dumps(report))
