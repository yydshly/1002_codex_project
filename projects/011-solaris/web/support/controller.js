import { SUPPORT_POLICY, transformSurface, transformTriangles, tableObstacles,
  checkPlacement, checkTranslationSweep, checkRotationSweep, recommendPlacement } from './geometry.js';
import { SupportStore, parseSupportBackup } from './state.js';

const clone = value => structuredClone(value);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const identity = () => ({ x:0,y:0,z:0,yaw:0,scale:{x:1,y:1,z:1} });
const failure = reason => ({ok:false,reason});
const geometryReply = result => ({...result,ok:result.valid===true});
const defaultStatus = () => ({transactionActive:false,invalidPending:false,label:null,canUndo:false,canRedo:false});

export function localAnchorToWorld(anchor,transform){
  const c=Math.cos(transform.yaw),s=Math.sin(transform.yaw),x=anchor.x*transform.scale.x,z=anchor.z*transform.scale.z;
  return [transform.x+c*x+s*z,transform.z-s*x+c*z];
}
export function worldAnchorToLocal(anchor,transform){
  const c=Math.cos(transform.yaw),s=Math.sin(transform.yaw),x=anchor[0]-transform.x,z=anchor[1]-transform.z;
  return {x:(c*x-s*z)/transform.scale.x,z:(s*x+c*z)/transform.scale.z};
}

/** Worker-owned bridge between immutable source analysis and the pure store.
 * A pending asset/surface choice hides the old scheme, but retains its history.
 * Geometry is never replaced by saved evidence or hand-authored contact data.
 */
export class SupportController {
  constructor(prepared,{savedRaw=null}={}){
    if(prepared?.policy!==SUPPORT_POLICY.version||!prepared.lamp?.base||!Array.isArray(prepared.tables)||!prepared.tables.length)throw new Error('完整支撑分析资料尚未就绪');
    this.prepared=prepared;this.tables=new Map(prepared.tables.map(t=>[t.asset.id,t]));
    if(this.tables.size!==prepared.tables.length||this.tables.has(prepared.lamp.asset.id))throw new Error('登记资产标识重复');
    this.worldCache=new Map();this.placementCache=new Map();this.store=null;
    this.activeAssetId=prepared.tables[0].asset.id;this.pending=true;this.savedRejected=null;
    const assets=new Map(prepared.tables.map(t=>[t.asset.id,{sha256:t.asset.sourceFingerprint,analysisVersion:prepared.policy,surfaces:t.surfaces??[]} ]));
    assets.set(prepared.lamp.asset.id,{sha256:prepared.lamp.asset.sourceFingerprint});
    this.options={analysisVersion:prepared.policy,assets,validatePlacement:state=>this.placement(state),checkSweep:(from,to)=>this.sweep(from,to)};
    if(savedRaw!==null&&savedRaw!==undefined){
      const checked=parseSupportBackup(savedRaw,this.options);
      if(checked.ok){this.store=new SupportStore({...this.options,initialState:checked.state});this.pending=false;this.activeAssetId=checked.state.table.assetId;}
      else this.savedRejected=checked.reason;
    }
  }

  publicAnalysis(){
    const p=this.prepared;
    return clone({policy:p.policy,lamp:{asset:p.lamp.asset,normalization:p.lamp.mesh.normalization,bounds:p.lamp.mesh.bounds,base:p.lamp.base},
      tables:p.tables.map(t=>({asset:t.asset,normalization:t.mesh?.normalization,bounds:t.mesh?.bounds,valid:t.valid,reason:t.reason??null,status:t.status,
        surfaces:(t.surfaces??[]).map(s=>({id:s.id,height:s.height,heightRange:s.heightRange,triangleCount:s.triangleCount,triangles:s.triangles,bounds:s.bounds,recommendation:s.recommendation}))}))});
  }

  world(state){
    const table=this.tables.get(state.table.assetId),source=table?.surfaces?.find(s=>s.id===state.table.surfaceId);
    if(!table?.valid||!source)throw new Error('所选桌模型或支撑面没有有效分析');
    const key=JSON.stringify([state.table.assetId,state.table.surfaceId,state.table.transform]);
    if(this.worldCache.has(key))return this.worldCache.get(key);
    const surface=transformSurface(source,state.table.transform);
    const triangles=transformTriangles(table.mesh.triangles,state.table.transform),obstacles=tableObstacles(triangles,surface);
    const result={surface,obstacles};this.worldCache.set(key,result);
    if(this.worldCache.size>4)this.worldCache.delete(this.worldCache.keys().next().value);
    return result;
  }

  lampOptions(state,world){return {anchor:localAnchorToWorld(state.attachment.localAnchor,state.table.transform),
    yaw:state.table.transform.yaw+state.lamp.yaw,scale:state.lamp.scale,obstacles:world.obstacles};}

  placement(state){
    const registeredLamp=this.prepared.lamp.asset;
    if(state?.lamp?.assetId!==registeredLamp.id||state.lamp.sha256!==registeredLamp.sourceFingerprint)return failure('所选资产没有登记为本工作台的独立底座灯');
    const key=JSON.stringify(state);if(this.placementCache.has(key))return clone(this.placementCache.get(key));
    let result;
    try{const world=this.world(state);result=geometryReply(checkPlacement(world.surface,this.prepared.lamp.base,this.lampOptions(state,world)));}
    catch(error){result=failure(error.message);}
    this.placementCache.set(key,result);if(this.placementCache.size>64)this.placementCache.delete(this.placementCache.keys().next().value);
    return clone(result);
  }

  sweep(from,to){
    if(from.table.assetId!==to.table.assetId||from.table.surfaceId!==to.table.surfaceId||from.lamp.assetId!==to.lamp.assetId)return failure('连续手势不能更换资产或支撑面');
    const a=from.table.transform,b=to.table.transform;
    if(!same(a,b)){
      // Both table and attached lamp translate together relative to their source
      // obstacles. Endpoint validation still proves the entire world relation.
      const onlyPlanarTranslation=a.y===b.y&&a.yaw===b.yaw&&same(a.scale,b.scale)&&same(from.lamp,to.lamp)&&same(from.attachment,to.attachment);
      return onlyPlanarTranslation?{ok:true,evidence:{policy:SUPPORT_POLICY.version,sweep:'common-table-and-lamp-translation',scope:'original-table-obstacles-only'}}:failure('桌子旋转或拉伸仅支持离散提交，不属于连续贴面手势');
    }
    if(from.lamp.scale!==to.lamp.scale)return failure('灯具尺寸变化仅支持离散提交');
    try{
      const world=this.world(from),start=this.lampOptions(from,world),end=this.lampOptions(to,world);
      const anchorSame=same(from.attachment,to.attachment),yawSame=from.lamp.yaw===to.lamp.yaw;
      if(yawSame)return geometryReply(checkTranslationSweep(world.surface,this.prepared.lamp.base,start,end));
      if(anchorSame)return geometryReply(checkRotationSweep(world.surface,this.prepared.lamp.base,start,end));
      return failure('同一连续步骤不能同时移动与转动灯具');
    }catch(error){return failure(error.message);}
  }

  snapshot(fields={ok:true}){
    const state=this.pending?null:this.store?.getState()??null;
    const current=state?this.placement(state):null;
    const status={...(this.store?.getStatus()??defaultStatus()),pendingSurfaceChoice:this.pending};
    if(this.pending&&this.store)status.canUndo=true;
    return {...fields,state,status,activeAssetId:this.activeAssetId,
      worldPose:current?.worldPose??null,evidence:current?.evidence??fields.evidence??null};
  }

  selectAsset(assetId){
    if(!this.tables.has(assetId))return this.snapshot(failure('未登记这个桌模型'));
    this.store?.cancel('切换模型前取消鼠标事务');this.activeAssetId=assetId;this.pending=true;
    return this.snapshot({ok:true,reason:'请选择自动检测出的支撑面；旧方案及其历史已保留'});
  }

  selectSurface(surfaceId){
    const table=this.tables.get(this.activeAssetId),source=table?.surfaces?.find(s=>s.id===surfaceId);
    if(!table?.valid||!source)return this.snapshot(failure('所选模型没有这个有效候选面'));
    this.store?.cancel('选择支撑面前取消鼠标事务');
    const previous=this.store?.getState(),transform=previous?.table.assetId===table.asset.id?clone(previous.table.transform):identity();
    const lamp=previous?.lamp??{assetId:this.prepared.lamp.asset.id,sha256:this.prepared.lamp.asset.sourceFingerprint,scale:1,yaw:0};
    const shell={table:{assetId:table.asset.id,sha256:table.asset.sourceFingerprint,analysisVersion:this.prepared.policy,surfaceId,transform},lamp:clone(lamp),attachment:{localAnchor:{x:0,z:0}}};
    try{
      const world=this.world(shell),recommendation=recommendPlacement(world.surface,this.prepared.lamp.base,{yaw:transform.yaw+lamp.yaw,scale:lamp.scale,obstacles:world.obstacles});
      if(!recommendation.valid)return this.snapshot({ok:false,reason:recommendation.reason,evidence:recommendation.evidence});
      shell.attachment.localAnchor=worldAnchorToLocal(recommendation.anchor,transform);
      let result;
      if(!this.store){this.store=new SupportStore({...this.options,initialState:shell});result={ok:true,changed:true,label:'明确选择支撑面并放灯'};}
      else result=this.store.apply(shell,'换桌并重新放灯');
      if(result.ok){this.pending=false;this.activeAssetId=table.asset.id;}
      return this.snapshot(result);
    }catch(error){return this.snapshot(failure(error.message));}
  }

  dispatch(type,payload={}){
    try{
      if(type==='init')return this.snapshot({ok:true,savedRejected:this.savedRejected,reason:this.savedRejected?`本机方案未采用：${this.savedRejected}`:this.pending?'请选择自动检测出的支撑面':'已核对并恢复本机研究方案'});
      if(type==='selectAsset')return this.selectAsset(payload.assetId);
      if(type==='selectSurface')return this.selectSurface(payload.surfaceId);
      if(type==='checkBackup')return this.snapshot(parseSupportBackup(payload.rawText,this.options));
      if(type==='restore'){
        const checked=parseSupportBackup(payload.rawText,this.options);if(!checked.ok)return this.snapshot(checked);
        let result;if(!this.store){this.store=new SupportStore({...this.options,initialState:checked.state});result={ok:true,changed:true,label:'打开研究方案'};}
        else result=this.store.restore(payload.rawText);
        if(result.ok){this.pending=false;this.activeAssetId=this.store.getState().table.assetId;}
        return this.snapshot(result);
      }
      if(type==='undo'&&this.pending&&this.store){this.pending=false;this.activeAssetId=this.store.getState().table.assetId;return this.snapshot({ok:true,changed:false,reason:'已回到选择模型前保留的方案'});}
      if(type==='cancel'&&this.pending&&this.store){this.pending=false;this.activeAssetId=this.store.getState().table.assetId;return this.snapshot({ok:true,cancelled:true,reason:payload.reason??'取消候选面选择'});}
      if(this.pending||!this.store)return this.snapshot(failure('先明确选择一个支撑面，才能编辑、保存或导出方案'));
      let result;
      switch(type){
        case 'begin':result=this.store.begin(payload.label);break;
        case 'update':result=this.store.update(payload.state);break;
        case 'commit':result=this.store.commit();break;
        case 'cancel':result=this.store.cancel(payload.reason);break;
        case 'apply':result=this.store.apply(payload.state,payload.detail??'修改研究方案');break;
        case 'undo':result=this.store.undo();break;
        case 'redo':result=this.store.redo();break;
        case 'export':result={ok:true,rawText:this.store.export()};break;
        default:result=failure('未支持的工作台操作');
      }
      this.activeAssetId=this.store.getState().table.assetId;return this.snapshot(result);
    }catch(error){return this.snapshot(failure(error.message));}
  }
}
export const createSupportController=(prepared,options)=>new SupportController(prepared,options);
