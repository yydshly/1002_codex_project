const steps = [
 {title:'下发目标',role:'user',owner:'你 · 用户',description:'先明确想实现什么。本次用户提出望远镜演示，并要求过程和责任分工清楚。',input:'你在聊天中提出的原始请求。',action:'给出对象、演示范围和解释要求；本次没有指定口径、长度或真实零件。',output:'目标交给语言模型解释与拆解。',model:'telescope_assembly',detail:'goal'},
 {title:'制定方案与参数',role:'agent',owner:'我 · 语言模型',description:'我选择折射式概念结构，并补全演示尺寸、功能基准和验收要求。参数来源会明确记录。',input:'望远镜目标，以及“步骤和职责必须标清”的要求。',action:'决定物镜、镜筒、调焦、目镜和支架结构；设定尺寸与运动范围。',output:'目标规格与设计假设，交给建模代码。',model:'telescope_tube',detail:'parameters'},
 {title:'拆成零件与接口',role:'agent',owner:'我 · 语言模型',description:'把产品拆成独立实体和功能组件，再定义它们的轴线、位置、套接和运动关系。',input:'明确的结构方案、尺寸和功能基准。',action:'组织 11 个独立实体；物镜和目镜同轴，调焦单位可滑动，支架可转动。',output:'装配树与接口关系，交给源码实现。',model:'telescope_exploded',detail:'parts'},
 {title:'编写建模代码',role:'agent',owner:'我 · 语言模型',description:'我把参数与构造顺序写成 Python。插件接收的是可执行建模代码和运动声明。',input:'结构、参数、独立零件和接口关系。',action:'编写实体相减、曲面交集、定位与装配代码，声明三种运动及其范围。',output:'项目内实际保存的 Python 源码，交给插件运行。',model:'telescope_tube',detail:'code'},
 {title:'插件与内核执行',role:'plugin',owner:'插件执行 · 内核计算',description:'cadgen 管理构建和导出，build123d 将 Python 操作传递给 OCP / OpenCascade，内核完成实体运算。',input:'语言模型写好的源码与运动声明。',action:'运行模型；内核计算曲面、实体相减和合并；插件保存 STEP、GLB 和运动旁文件。',output:'实际 CAD 产物和构建日志，交给我检查。',model:'telescope_assembly',detail:'build'},
 {title:'独立回读验收',role:'agent',owner:'我验收 · 内核测量',description:'我编写独立规格检查。检查读取保存的 STEP，利用内核取得实际尺寸和交叠体积。',input:'已保存的 CAD 文件，以及独立验收规格。',action:'检查实体有效性、420 mm 镜筒、0.25 mm 调焦间隙、20 mm 位移、12 mm 套接和指定姿态。',output:'实测验收报告，交给修正环节或用户。',model:'telescope_extended',detail:'validation'},
 {title:'发现问题并修正',role:'agent',owner:'我修改 · 插件重建',description:'第一次运动验收发现 60° 姿态干涉。我调整支架底板高度，插件重新生成，再用原验收规则复核。',input:'修正前的失败报告与干涉对象。',action:'底板降低 30 mm，保留转轴；重新构建、测量和复核，失败证据保留。',output:'修正后的结构和对比报告，交给用户审阅。',model:'telescope_assembly',detail:'repair'},
 {title:'审阅结果与再下发',role:'user',owner:'你 · 用户',description:'你可以旋转、测量、查看分解结构和调焦变化，再提出下一轮修改要求。',input:'已通过当前几何验收的装配、源码和报告。',action:'检查是否符合你的目标；指定希望改变的功能、尺寸或零件。',output:'新的要求再交给语言模型，进入下一轮设计、生成与验收。',model:'telescope_assembly',detail:'review'}
];
let selected=0, currentModel='', data={};
const captions={telescope_assembly:'11 个独立实体 · 带方位 / 仰角 / 调焦运动',telescope_exploded:'分解视图 · 组件位置仅用于展示',telescope_extended:'保存几何变体 · 调焦单位实际平移 20 mm',telescope_tube:'主镜筒 · 420 mm / 外径 86 mm / 内径 80 mm'};
const $=id=>document.getElementById(id);
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function sourceLink(parent,text,path){const a=el('a',text,'source-link');a.href='/artifacts/'+path;a.target='_blank';parent.append(a);}
function table(parent,headers,rows){const t=el('table');const head=el('tr');headers.forEach(v=>head.append(el('th',v)));t.append(head);rows.forEach(row=>{const tr=el('tr');row.forEach(v=>tr.append(el('td',String(v))));t.append(tr);});parent.append(t);}
function showModel(name){
 currentModel=name;
 const url=new URL(data.config.viewer_url);url.searchParams.set('file','STEP/'+name+'.step');
 if($('cad').src!==url.href)$('cad').src=url.href;
 $('open-cad').href=url.href;$('model-caption').textContent=captions[name]||name;
 for(const b of document.querySelectorAll('[data-model]'))b.setAttribute('aria-pressed',String(b.dataset.model===name));
 $('step-file').href='/artifacts/STEP/'+name+'.step';$('step-file').setAttribute('download','');
 $('glb-file').href='/artifacts/GLB/'+name+'.glb';$('glb-file').setAttribute('download','');
}
function details(kind){
 const box=$('detail');box.replaceChildren();
 if(kind==='goal'){
  box.append(el('p','本次实际下发的目标','detail-title'),el('blockquote',data.target.user_request));
  box.append(el('p','我补全的演示目标','detail-title'),el('p',data.target.agent_proposed_target,'note'));
  sourceLink(box,'查看目标与假设记录 ↗','notes/telescope-target.json');
 }else if(kind==='parameters'){
  table(box,['参数','值','来源'],[['物镜净口径','70 mm','模型假设'],['主镜筒','420 mm，Ø86 / Ø80','模型假设'],['调焦行程','0–20 mm','模型假设'],['调焦径向间隙','0.25 mm','模型设定并实测'],['仰角 / 方位','0–60° / ±135°','模型假设']]);
  box.append(el('p',data.target.parameter_source,'note'));
 }else if(kind==='parts'){
  const list=el('ul',undefined,'part-list');['物镜组：镜框 + 曲面镜片','主镜筒：有明确内外径的空心实体','调焦座：固定套接接口','调焦单位：滑筒 + 目镜筒 + 镜片 + 眼罩','镜筒托架：双环、托板与转轴销','支架：底座立柱 + 转动叉架'].forEach(v=>list.append(el('li',v)));box.append(list);
  box.append(el('p','接口由我指定：统一 X 轴，调焦单位整体移动，镜筒与托架属于同一转动组。','note'));
 }else if(kind==='code'){
  const start=data.source.indexOf('def tube_geometry():');const end=data.source.indexOf('\n\ndef objective_geometry():');
  box.append(el('p','实际源码片段','detail-title'),el('pre',data.source.slice(start,end),'code'));
  box.append(el('p','ring_x 内部创建两个圆柱并相减；各部件由独立模型入口导出。','note'));
  sourceLink(box,'几何代码 ↗','src/telescope_geometry.py');sourceLink(box,'装配与运动声明 ↗','src/telescope_assembly.py');
 }else if(kind==='build'){
  box.append(el('pre','Python 源码\n  → cadgen 构建流程\n  → build123d 建模接口\n  → OCP Python 绑定\n  → OpenCascade 几何运算\n  → STEP / GLB / 运动声明','code'));
  table(box,['实际构建入口','退出码'],data.build.records.filter(v=>v.stage==='build').map(v=>[v.command.replace('uv run --frozen python ',''),v.exit_code]));
  box.append(el('p','这是已经执行的构建记录，步骤按钮用于回放。实际命令和退出状态保存在报告中。','note'));
  sourceLink(box,'构建记录 ↗','notes/telescope-build-log.json');
 }else if(kind==='validation'){
  const badge=el('div',undefined,'evidence');badge.append(el('b',data.report.status==='pass'?'当前几何验收通过':'当前验收未通过'),el('span',`${data.report.checks_passed} 项通过 / ${data.report.checks_failed} 项失败`));box.append(badge);
  const names=['focus.radial_clearance','extended.engagement','focus_drawtube.measured_extension','tube.analytic_volume'];
  const labels=['调焦径向间隙','伸出后的套接','滑筒实际位移','镜筒解析体积'];
  table(box,['实测项目','读取结果'],names.map((name,i)=>{const row=data.report.checks.find(c=>c.name===name);return[labels[i],row?`${Number(row.observed).toFixed(i===3?2:2)} ${row.units||''}`:'尚无结果'];}));
  box.append(el('p','另外检查基准、伸出和三组运动采样姿态的全部零件对。几何检查不代表光学、承载或连续运动范围全部合格。','note'));
 }else if(kind==='repair'){
  table(box,['验收结果','修正前','修正后'],[['失败项',data.before.checks_failed,data.report.checks_failed],['最大交叠体积',Math.max(...data.before.sampled_poses.map(p=>p.maximum_overlap_mm3)).toFixed(2)+' mm³',Math.max(...data.report.sampled_poses.map(p=>p.maximum_overlap_mm3)).toFixed(2)+' mm³']]);
  box.append(el('p','第一次设计没有满足运动空间要求。语言模型根据失败结果修改结构，内核重新计算，验收脚本再次判定。','note'));
  sourceLink(box,'修正前失败报告 ↗','notes/telescope-validation-before-repair.json');sourceLink(box,'修正后报告 ↗','notes/telescope-validation.json');
 }else{
  box.append(el('p','可直接提出下一轮目标','detail-title'),el('blockquote','把镜筒改长；改变调焦行程；替换成有真实尺寸的物镜；添加具体的紧固与调节机构。'));
  box.append(el('p','当前三个运动自由度由人工编写的声明驱动，展示结构动作；镜片为几何占位，成像、倍率、像差和真实装配紧固尚未验收。','note'));
  sourceLink(box,'独立验收代码 ↗','checks/verify_telescope.py');sourceLink(box,'重新生成演示的脚本 ↗','scripts/run-telescope-demo.ps1');
 }
}
function selectStep(index){selected=index;const step=steps[index];$('step-index').textContent=`STEP ${String(index+1).padStart(2,'0')} / 08`;$('owner').textContent=step.owner;$('step-title').textContent=step.title;$('step-description').textContent=step.description;['input','action','output'].forEach(k=>$('step-'+k).textContent=step[k]);document.querySelectorAll('[data-role]').forEach(n=>n.dataset.active=String(n.dataset.role===step.role||step.role==='plugin'&&n.dataset.role==='kernel'));document.querySelectorAll('[data-step]').forEach(b=>{if(Number(b.dataset.step)===index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});$('previous').disabled=index===0;$('next').disabled=index===steps.length-1;details(step.detail);showModel(step.model);}
async function start(){
 const endpoints=['config','target','report','before','build'];
 const responses=await Promise.all(endpoints.map(async k=>{const r=await fetch('/api/'+k);if(!r.ok)throw Error('无法读取 '+k+' 的实际记录');return[k,await r.json()];}));
 data=Object.fromEntries(responses);const source=await fetch('/artifacts/src/telescope_geometry.py');if(!source.ok)throw Error('无法读取建模源码');data.source=await source.text();
 steps.forEach((s,i)=>{const b=el('button');b.type='button';b.dataset.step=i;b.append(el('small',`${String(i+1).padStart(2,'0')} · ${s.role==='user'?'用户':s.role==='plugin'?'插件 / 内核':'语言模型'}`),el('span',s.title));b.addEventListener('click',()=>selectStep(i));$('steps').append(b);});
 $('previous').addEventListener('click',()=>selectStep(Math.max(0,selected-1)));$('next').addEventListener('click',()=>selectStep(Math.min(7,selected+1)));
 document.querySelectorAll('[data-model]').forEach(b=>b.addEventListener('click',()=>showModel(b.dataset.model)));
 selectStep(0);
}
start().catch(err=>{$('error').hidden=false;$('error').textContent='演示读取失败：'+err.message;});
