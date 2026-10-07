import * as THREE from '../studio/vendor/three.module.js';
import {OrbitControls} from '../studio/vendor/addons/controls/OrbitControls.js';
import {GLTFLoader} from '../studio/vendor/addons/loaders/GLTFLoader.js';
import {HDRLoader} from '../studio/vendor/addons/loaders/HDRLoader.js';

export class SupportScene {
  constructor(host) {
    this.host=host; this.scene=new THREE.Scene(); this.scene.background=new THREE.Color('#e1ded1');
    this.scene.fog=new THREE.Fog('#e1ded1',9,24);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2)); this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap; this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.2; host.append(this.renderer.domElement);
    this.camera=new THREE.PerspectiveCamera(35,1,.01,60);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement); this.controls.enableDamping=true;
    this.controls.minDistance=1;this.controls.maxDistance=8;this.controls.maxPolarAngle=Math.PI*.49;
    this.controls.target.set(0,.65,0);this.home();
    this.scene.add(new THREE.HemisphereLight('#fff8e7','#c7c4b0',2));
    const sun=new THREE.DirectionalLight('#fff3d7',4);sun.position.set(-3,5,3);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;
    sun.shadow.camera.top=5;sun.shadow.camera.bottom=-5;sun.shadow.normalBias=.015;sun.shadow.bias=-.00015;
    this.scene.add(sun,new THREE.AmbientLight('#eae4d1',.3));
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#d4d1c1',roughness:.85}));
    floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=-.004;this.scene.add(floor);
    this.loader=new GLTFLoader();this.models=new Map();this.surfaceOverlay=new THREE.Group();this.surfaceOverlay.visible=false;this.scene.add(this.surfaceOverlay);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.revision=0;
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
    this.renderer.setAnimationLoop(()=>{this.controls.update();this.renderer.render(this.scene,this.camera);});
    new HDRLoader().load(new URL('../studio/assets/environment/coastal-day.hdr',import.meta.url).href,hdr=>{
      const pmrem=new THREE.PMREMGenerator(this.renderer);this.scene.environment=pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose();pmrem.dispose();
    },undefined,()=>{});
  }
  resize(){const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);if(this.tableData)this.home();}
  fitDistance(){const b=this.tableData?.bounds,t=this.tablePose;if(!b)return 4.1;const width=(b.max[0]-b.min[0])*(t?.scale.x??1),depth=(b.max[2]-b.min[2])*(t?.scale.z??1);
    return Math.max(4.1,Math.hypot(width,depth)/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*this.camera.aspect)*1.12);}
  home(){const t=this.tablePose??{x:0,y:0,z:0},d=this.fitDistance();this.controls.target.set(t.x,t.y+.65,t.z);this.camera.position.copy(new THREE.Vector3(2.4,1.3,3.05).normalize().multiplyScalar(d).add(this.controls.target));this.controls.maxDistance=Math.max(8,d*2);this.controls.update();}
  top(){const t=this.tablePose??{x:0,y:0,z:0};this.controls.target.set(t.x,t.y+.4,t.z);this.camera.position.set(t.x+.001,t.y+.4+Math.max(4.5,this.fitDistance()),t.z+.001);this.controls.update();}
  async model(item) {
    if(!this.models.has(item.asset.id))this.models.set(item.asset.id,this.loader.loadAsync(new URL(item.asset.modelPath,import.meta.url).href).then(gltf=>{
      const normalized=new THREE.Group();normalized.add(gltf.scene);
      normalized.scale.setScalar(item.normalization.factor);normalized.position.fromArray(item.normalization.translation);
      gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      const instance=new THREE.Group();instance.add(normalized);instance.visible=false;this.scene.add(instance);return instance;
    }));
    return this.models.get(item.asset.id);
  }
  async prepare(analysis){this.analysis=analysis;await Promise.all([this.model(analysis.lamp),...analysis.tables.filter(t=>t.normalization).map(t=>this.model(t))]);}
  async update(reply) {
    const revision=++this.revision,state=reply.state,assetId=reply.activeAssetId??state?.table.assetId;
    const tableData=this.analysis.tables.find(t=>t.asset.id===assetId);if(!tableData?.normalization){for(const p of this.models.values())(await p).visible=false;this.clearOverlay();this.table=null;this.lamp=null;return;}
    const [table,lamp]=await Promise.all([this.model(tableData),this.model(this.analysis.lamp)]);if(revision!==this.revision)return;
    for(const p of this.models.values())(await p).visible=false;
    const t=state?.table.assetId===assetId?state.table.transform:{x:0,y:0,z:0,yaw:0,scale:{x:1,y:1,z:1}};
    const changedAsset=this.tableData?.asset.id!==assetId;this.tableData=tableData;this.tablePose=t;if(changedAsset)this.home();
    table.visible=true;table.position.set(t.x,t.y,t.z);table.rotation.y=t.yaw;table.scale.set(t.scale.x,t.scale.y,t.scale.z);
    this.table=table;this.lamp=lamp;this.surfaceHeight=null;
    if(state&&reply.worldPose){const p=reply.worldPose;lamp.visible=true;lamp.position.set(p.x,p.y,p.z);lamp.rotation.y=p.yaw;lamp.scale.setScalar(p.scale);
      const face=tableData.surfaces.find(s=>s.id===state.table.surfaceId);this.surfaceHeight=face.height*t.scale.y+t.y;
      this.drawOverlay(face,t,p,reply.ok!==false);
    }else this.clearOverlay();
  }
  clearOverlay(){for(const o of [...this.surfaceOverlay.children]){o.geometry?.dispose();o.material?.dispose();this.surfaceOverlay.remove(o);}}
  drawOverlay(face,t,pose,valid){this.clearOverlay();if(!face)return;
    const c=Math.cos(t.yaw),s=Math.sin(t.yaw),y=t.y+face.height*t.scale.y+.003;
    const world=([x,z])=>[t.x+c*x*t.scale.x+s*z*t.scale.z,y,t.z-s*x*t.scale.x+c*z*t.scale.z];
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(face.triangles.flatMap(tri=>tri.flatMap(world)),3));
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#a5c590',transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false}));
    this.surfaceOverlay.add(mesh);
    const cc=Math.cos(pose.yaw),ss=Math.sin(pose.yaw),polygon=this.analysis.lamp.base.polygon;
    const points=[...polygon,polygon[0]].map(([x,z])=>new THREE.Vector3(pose.x+(cc*x+ss*z)*pose.scale,y+.002,pose.z+(-ss*x+cc*z)*pose.scale));
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:valid?'#496d2f':'#b88440',depthTest:false}));line.renderOrder=20;this.surfaceOverlay.add(line);
  }
  showSurface(show){this.surfaceOverlay.visible=show;}
  pick(event,mode){this.setRay(event);const target=mode==='lamp'?this.lamp:this.table;return target?.visible&&this.raycaster.intersectObject(target,true).length>0;}
  setRay(event){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);}
  point(event,height){this.setRay(event);const p=new THREE.Vector3();return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-height),p)?{x:p.x,z:p.z}:null;}
}
