const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const node = (tag, value, className) => { const el=document.createElement(tag); el.textContent=value; if(className)el.className=className; return el; };
let data, filter = 'all', phaseFilter = 'all', selectedPhase;
const phaseFor = id => data.roadmap.phases.find(p => p.id === id);
const phaseLabel = phase => `阶段 ${String(phase.order).padStart(2,'0')}`;
const onDemand = () => data?.projectStatus?.expansionMode === 'on-demand';
const phaseState = phase => phase.connected===phase.total ? '已接入 · 限定范围' : onDemand() ? (phase.connected ? '部分接入 · 按需扩展' : '按需研究') : phase.id===data.roadmap.activePhaseId ? '当前推进' : phase.connected ? '部分接入' : '待研发';

function render() {
  const query=$('#capability-search').value.trim().toLowerCase();
  const matches=data.capabilities.filter(c => {
    const searchable=`${c.id} ${c.name} ${c.family} ${c.scope} ${c.plan.scenario} ${phaseFor(c.plan.phaseId).name}`.toLowerCase();
    return (filter==='all'||(filter==='connected')===(c.status==='implemented-bounded')) && (phaseFilter==='all'||c.plan.phaseId===phaseFilter) && searchable.includes(query);
  });
  $('#result-count').textContent=`显示 ${matches.length} / ${data.total} 项${phaseFilter==='all'?'':` · ${phaseFor(phaseFilter).name}`} · 点击条目查看规划、入口、实现和验收要求`;
  const list=$('#capability-list');list.replaceChildren();
  for(const c of matches){
    const connected=c.status==='implemented-bounded', phase=phaseFor(c.plan.phaseId);
    const detail=document.createElement('details'),summary=document.createElement('summary');
    const phaseBadge=node('span',phaseLabel(phase),'phase-badge');phaseBadge.title=phase.name;
    summary.append(node('span',c.id,'cap-id'),node('strong',c.name),node('span',c.family,'family'),phaseBadge,node('span',connected?'已接入 · 限定范围':'待接入',connected?'badge connected':'badge'));
    const dl=document.createElement('dl');
    for(const [term,value] of [
      ['接入阶段',`${phaseLabel(phase)} · ${phase.name}`],
      ['研发安排',onDemand() ? (connected?'已接入限定范围；基础探索收束，后续按产品需求验证':'按需扩展，尚未排期；已有接入条件保留') : connected?'已接入，持续验证画面、交互与状态可靠性':c.plan.priority],
      ['目标场景',c.plan.scenario],['依赖条件',c.plan.dependencies.join('；')],
      ['操作入口',c.entrance],['当前范围',c.scope],['实现方案',c.implementation],['需要的数据',c.input],
      [connected?'体验方法':onDemand()?'后续接入条件':'下一步接入',connected?c.trial:c.next],['验收要求',c.acceptance]
    ]) { dl.append(node('dt',term),node('dd',value || '请查看对应场景操作说明')); }
    detail.append(summary,dl);list.append(detail);
  }
  if(!matches.length)list.append(node('p','没有找到匹配的能力。可切换接入状态、研发阶段或清空搜索。','empty'));
}

function listBlock(title, items) {
  const block=document.createElement('div'),ul=document.createElement('ul');
  block.append(node('h4',title));for(const value of items)ul.append(node('li',value));block.append(ul);return block;
}

function renderScenes() {
  $('#scene-verification-principle').textContent=data.scenePrinciple;
  const grid=$('#scene-verification-cards');grid.replaceChildren();
  for(const scene of data.scenes){
    const card=document.createElement('article');card.className='scene-verification-card';
    const top=document.createElement('div');top.className='scene-verification-top';
    top.append(node('span',scene.eyebrow,'eyebrow'),node('span',`${scene.connected}/${scene.total} 项已接入`,'scene-connection-state'));
    card.append(top,node('h3',scene.name),node('p',scene.purpose,'scene-purpose'));
    const targets=document.createElement('div');targets.className='scene-target-capabilities';
    for(const capability of scene.capabilities){const tag=node('span',`${capability.id} ${capability.name}`);tag.className=capability.status==='implemented-bounded'?'connected':'';targets.append(tag);}
    card.append(targets);
    const checks=document.createElement('div');checks.className='scene-card-checks';
    checks.append(listBlock('已做验证',scene.validation.completed),listBlock('待专项验收',scene.validation.pending));card.append(checks);
    const boundary=node('p',scene.boundaries.join(' '),'scene-card-boundary');boundary.prepend(node('strong','当前边界 · '));card.append(boundary);
    const supporting=node('p',`产品支撑：${scene.supporting.map(item=>item.name).join('、')}；不重复计入研究项。`,'scene-card-supporting');card.append(supporting);
    const actions=document.createElement('div');actions.className='scene-card-actions';
    const brief=node('button','本场景验证什么');brief.type='button';brief.dataset.sceneCapabilities=scene.id;
    const entrance=node('a',scene.status==='verification-pending'?'打开场景 · 本轮验收中 ↗':'打开场景 ↗');entrance.href=scene.entry;
    actions.append(brief,entrance);
    for(const entry of scene.additionalEntries??[]){const link=node('a',`${entry.name} ↗`);link.href=entry.entry;actions.append(link);}
    card.append(actions);grid.append(card);
  }
}

function renderPhase(phaseId) {
  selectedPhase=phaseId;const phase=phaseFor(phaseId),detail=$('#phase-detail');detail.replaceChildren();
  $$('#roadmap-phases button').forEach(button=>{const active=button.dataset.phase===phaseId;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
  const heading=document.createElement('div');heading.className='phase-heading';
  const headingText=document.createElement('div');headingText.append(node('span',`${phaseLabel(phase)} · ${phaseState(phase)}`,'eyebrow'));
  const title=node('h3',phase.name);title.id='phase-title';headingText.append(title,node('p',phase.goal));
  const view=document.createElement('a');view.href='#inventory';view.className='phase-view';view.textContent=`查看此阶段 ${phase.total} 项能力 ↓`;
  view.addEventListener('click',()=>{phaseFilter=phase.id;$('#phase-filter').value=phase.id;render();});heading.append(headingText,view);detail.append(heading);
  const scenes=document.createElement('div');scenes.className='scene-tags';scenes.append(node('span','目标场景','scene-label'));for(const value of phase.scenes)scenes.append(node('span',value));detail.append(scenes);
  const requirements=document.createElement('div');requirements.className='phase-requirements';requirements.append(listBlock('实现依赖',phase.dependencies),listBlock('进入产品的验收条件',phase.acceptance));detail.append(requirements);
  const boundary=node('p',phase.researchBoundary,'research-boundary');const label=node('strong','研发边界 · ');boundary.prepend(label);detail.append(boundary);
}

function renderRoadmap() {
  $('#roadmap-principle').textContent=data.roadmap.principle;$('#roadmap-boundary').textContent=data.roadmap.scheduleBoundary;
  const grid=$('#roadmap-phases');grid.replaceChildren();
  for(const phase of data.roadmap.phases){
    const card=document.createElement('button');card.type='button';card.dataset.phase=phase.id;card.className='phase-card';card.setAttribute('aria-pressed','false');
    const top=document.createElement('span');top.className='phase-card-top';top.append(node('span',phaseLabel(phase)),node('span',phaseState(phase),!onDemand()&&phase.id===data.roadmap.activePhaseId?'phase-state current':'phase-state'));
    const count=document.createElement('span');count.className='phase-count';count.append(node('strong',String(phase.connected)),node('span',` / ${phase.total} 项已接入`));
    card.append(top,node('strong',phase.name,'phase-card-title'),count);
    card.addEventListener('click',()=>{renderPhase(phase.id);phaseFilter=phase.id;$('#phase-filter').value=phase.id;render();});grid.append(card);
    const option=node('option',`${phaseLabel(phase)} · ${phase.name}`);option.value=phase.id;$('#phase-filter').append(option);
  }
  renderPhase(selectedPhase||data.roadmap.activePhaseId);
  for(const gate of data.roadmap.releaseGates){const card=document.createElement('article');card.append(node('h3',gate.name),node('p',gate.requirement));$('#release-gates').append(card);}
}

try {
  const response=await fetch('./studio/integration-data.json');if(!response.ok)throw Error('无法读取清单');data=await response.json();
  $('#release-version').textContent=data.version;$('#updated-at').textContent=data.updatedAt;
  $('#total-count').textContent=data.total;$('#connected-count').textContent=data.connected;$('#pending-count').textContent=data.total-data.connected;
  const filterCounts={all:data.total,connected:data.connected,pending:data.total-data.connected};
  $$('[data-filter]').forEach(button=>{button.append(node('span',String(filterCounts[button.dataset.filter]),'filter-count'));button.addEventListener('click',()=>{filter=button.dataset.filter;$$('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});render();});});
  for(const tool of data.editorTools){const card=document.createElement('article');card.append(node('h3',tool.name),node('p',tool.entrance,'entrance'),node('p',tool.scope));$('#editor-tools').append(card);}
  $('#phase-filter').addEventListener('change',()=>{phaseFilter=$('#phase-filter').value;if(phaseFilter!=='all')renderPhase(phaseFilter);render();});
  $('#capability-search').addEventListener('input',render);renderScenes();renderRoadmap();render();
} catch(error) { $('#load-error').hidden=false;$('#roadmap-principle').textContent='规划暂时无法读取，请刷新重试。'; }
