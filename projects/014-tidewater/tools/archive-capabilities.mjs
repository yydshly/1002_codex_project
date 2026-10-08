import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const name='2026-10-07-capability-baseline-v5', destination=path.join(root,'versions',name);
const replay=path.join(root,'web/versions/2026-10-07-fine-components-v5');
const source=path.join(root,'.runtime/fine-project-verify-fb72a98c');
if(path.dirname(destination)!==path.join(root,'versions')||path.dirname(replay)!==path.join(root,'web/versions'))throw new Error('Archive target outside project.');
await fs.mkdir(destination); // Immutable: never replace an existing baseline.
await fs.cp(source,replay,{recursive:true,errorOnExist:true,force:false});
const hashes=[];
async function copy(relative){const bytes=await fs.readFile(path.join(root,relative));const target=path.join(destination,'source',relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx'});hashes.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
async function scan(relative){for(const item of await fs.readdir(path.join(root,relative),{withFileTypes:true})){if(['versions','previous','assets','vendor','node_modules'].includes(item.name))continue;const next=relative+'/'+item.name;if(item.isDirectory())await scan(next);else if(/\.(?:js|mjs|css|html|json|py|md|wgsl)$/u.test(item.name))await copy(next);}}
for(const folder of ['web','tools','tests','checks','notes'])await scan(folder);
for(const file of ['README.md','THIRD_PARTY_NOTICES.md'])await copy(file);
const inventory={format:'tidewater-capability-archive.v1',archivedAt:new Date().toISOString(),baseline:'fine-components-v5',
 purpose:'Freeze verified creation and controlled fine geometry before the camp proposal workflow.',
 capabilities:[
 {id:'layout',name:'绘笔与人工图片标记',status:'implemented',details:'陆地、水域、道路、小屋、灯塔、棕榈、船；原ID、锁定、移动、高度、撤销与本地草案。'},
 {id:'coarse',name:'真实3D粗模',status:'implemented',details:'依据plan直接生成几何；图片入口没有自动深度或场景识别。'},
 {id:'materials',name:'材质、环境与区域细化',status:'implemented',details:'既有PBR/HDR/扫描资源与本地地形、植被、水面规则。'},
 {id:'neural',name:'单对象图片到GLB实验',status:'verified-experiments',details:'已有TRELLIS.2小屋与TripoSR灯塔、棕榈、船；模型薄叶质量有限，在线生成依赖服务可用性。'},
 {id:'completion',name:'控制模型制定方案和部件几何',status:'implemented',details:'实际Codex CLI/ChatGPT读取布局与多视图；新增网格由结构化部件、曲线与顶点执行，具体模型ID未返回。'},
 {id:'scope',name:'单对象、同类和全场景精修',status:'verified-real-jobs',details:'scoped patch合并，独立核对范围外实例、模板、材质和朝向；含ribbon薄带。'},
 {id:'history',name:'候选、确认、回退与来源',status:'implemented',details:'候选与已确认版本分开保存；完整历史、输入图、任务回执与哈希。'},
 {id:'delivery',name:'GLB与独立网页工程',status:'verified-real-exports',details:'GLB重新解析、完整源ID、ZIP CRC/哈希与独立浏览器回放；网页保留动态效果，GLB为静态近似。'},
 {id:'cross-layout',name:'不同布局验证',status:'one-of-three-model-runs',details:'三份手绘静态基准；双岛已真实生成并保留锁定灯塔，未建立跨场景品质成功率。'}],
 limits:['任意场景或照片级一次生成尚未实现','七类海岸对象的契约仍是主要能力边界','没有完整自动碰撞、拓扑或视觉验收','当前业务场景仍是概念效果','没有云端发布、多人协作或业务数据系统'],
 records:{scopedJob:'40f03009-853b-40f3-b8dc-ca55f400e198',scopedDelivery:'fb72a98c-b32b-4165-8ea9-d024e779b5e6',dualJob:'a9f7a65f-71b0-43b1-8215-1aa6dc15411d',dualDelivery:'452dea3d-3ee7-48f9-a341-537dcd550572',sourceIds:25,fineObjects:17,parts:2368,scopedObjects:8,outsidePreserved:9,tests:226},
 replay:'web/versions/2026-10-07-fine-components-v5/index.html',sourceSnapshot:hashes,
 evidence:['checks/fine-scoped-generation-results.json','checks/fine-scoped-delivery-disk-results.json','checks/fine-benchmark-dual-island-delivery-results.json','checks/fine-scoped-browser-results.json'],
 archivePolicy:'Source and verification files are copied; registered large upstream/neural assets remain referenced. Complete fine scene runtime/resources are separately frozen in replay.'};
await fs.writeFile(path.join(destination,'capabilities.json'),JSON.stringify(inventory,null,2)+'\n',{flag:'wx'});
await fs.mkdir(path.join(root,'web/assets/capabilities'),{recursive:true});
await fs.writeFile(path.join(root,'web/assets/capabilities/baseline-v5.json'),JSON.stringify(inventory,null,2)+'\n');
console.log(JSON.stringify({archive:destination,replay,sourceFiles:hashes.length,capabilities:inventory.capabilities.length}));
