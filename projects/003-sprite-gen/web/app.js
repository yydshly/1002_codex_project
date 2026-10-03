(() => {
  'use strict';
  const data = window.SPRITE_DATA;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const source = (path) => `${data.repo}/blob/${data.commit}/${path}`;
  const escape = (text) => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentView = 'overview';
  let activeGroup = 'all';
  let pipe = 'B';
  let stageIndex = 0;

  $('.skip-link').addEventListener('click',event=>{event.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});});
  $('#navigation').addEventListener('click',event=>{const link=event.target.closest('[data-view]');if(link&&link.dataset.view===currentView){event.preventDefault();window.scrollTo({top:0,behavior:'instant'});}});

  $$('[data-doc]').forEach(link => link.href = source(link.dataset.doc));
  $('#catalog-count').textContent = `${data.capabilities.length} 项主要能力`;
  $('#source-grid').innerHTML = data.sources.map(([name,path]) => `<a class="source-card" href="${source(path)}" target="_blank" rel="noreferrer"><strong>${escape(name)}</strong><span>${escape(path)}</span></a>`).join('');
  $('#scenario-grid').innerHTML = data.scenarios.map(item => `<article class="scenario-card"><span class="scenario-label">${escape(item.label)}</span><h2>${escape(item.title)}</h2><p>${escape(item.description)}</p><div class="recommendation">${item.recommendation}</div></article>`).join('');

  function route() {
    const [name, query=''] = location.hash.slice(1).split('?');
    const next = ['overview','examples','pipelines','catalog','scenarios','value','sources'].includes(name) ? name : 'overview';
    const params = new URLSearchParams(query);
    const previous = currentView;
    currentView = next;
    $$('.view').forEach(section => section.hidden = section.id !== next);
    $$('#navigation a').forEach(link => {
      const active = link.dataset.view === next;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    });
    document.title = `${$('#'+next+' h1').textContent} · sprite-gen`;
    if (next === 'pipelines') selectPipeline(params.get('pipe') || pipe);
    if (next === 'catalog' && params.has('group')) { activeGroup = data.groups[params.get('group')] ? params.get('group') : 'all'; renderCatalog(); }
    if (next !== previous) { window.scrollTo({top:0,behavior:'instant'}); }
  }
  window.addEventListener('hashchange', route);

  $$('[data-hero]').forEach(button => button.addEventListener('click', () => {
    const hero = data.heroes[button.dataset.hero];
    $('#hero-sprite').src = `media/${hero.file}`;
    $('#hero-sprite').alt = hero.alt;
    $('#hero-caption').textContent = hero.caption;
    $('#hero-source').href = source(`docs/assets/${hero.file}`);
    $('#hero-stage .stage-coordinate').textContent = button.dataset.hero === 'furniture' ? 'CURATION / SCREEN RECORDING' : 'RGBA / LOOP';
    $$('[data-hero]').forEach(b => { const active = b === button; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active)); });
  }));
  $$('[data-bg]').forEach(button => button.addEventListener('click', () => {
    $('#hero-stage').className = `sprite-stage ${button.dataset.bg}`;
    $$('[data-bg]').forEach(b => { const active=b===button; b.classList.toggle('active',active); b.setAttribute('aria-pressed',String(active)); });
  }));

  function selectExample(name) {
    $$('[data-example]').forEach(button => {
      const active = button.dataset.example === name;
      button.setAttribute('aria-selected',String(active)); button.tabIndex = active ? 0 : -1;
      $(`#example-${button.dataset.example}`).hidden = !active;
    });
  }
  $$('[data-example]').forEach(button => button.addEventListener('click',()=>selectExample(button.dataset.example)));
  $$('.tab-list').forEach(list => list.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const buttons = [...list.querySelectorAll('[role=tab]')];
    let index = buttons.indexOf(document.activeElement);
    if (index<0) return;
    event.preventDefault();
    index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (index + (event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    buttons[index].focus(); buttons[index].click();
  }));

  function selectPipeline(name) {
    if (!data.pipelines[name]) name = 'B';
    if (name !== pipe) stageIndex = 0;
    pipe = name;
    const item = data.pipelines[pipe];
    stageIndex = Math.min(stageIndex,item.stages.length-1);
    $$('[data-pipe]').forEach(button => { const active=button.dataset.pipe===pipe; button.setAttribute('aria-selected',String(active)); button.tabIndex=active?0:-1; });
    $('#pipeline-panel').setAttribute('aria-labelledby',`pipe-tab-${pipe}`);
    $('#pipeline-summary').innerHTML = `<span class="badge ${pipe==='B'?'purple':'mint'}">${escape(item.badge)}</span><p>${escape(item.description)}</p>`;
    $('#pipeline-nodes').innerHTML = item.stages.map((stage,index) => `<button type="button" class="pipeline-node ${index===stageIndex?'active':''}" data-stage="${index}" aria-pressed="${index===stageIndex}"><span class="node-number">${String(index+1).padStart(2,'0')}</span><strong>${escape(stage.name)}</strong><code>${escape(stage.command)}</code><span class="node-kind">${escape(stage.kind)}</span></button>`).join('');
    renderStage();
  }
  function renderStage() {
    const stage = data.pipelines[pipe].stages[stageIndex];
    $('#stage-detail').innerHTML = `<div><span class="tiny-label">STAGE ${String(stageIndex+1).padStart(2,'0')} / ${escape(stage.kind)}</span><h2>${escape(stage.name)}</h2><p>${escape(stage.principle)}</p><a class="source-link" href="${source(stage.doc)}" target="_blank" rel="noreferrer">查看源码或处理契约</a></div><div><div class="io-box"><div class="io-item"><span>INPUT / 输入</span><code>${escape(stage.input)}</code></div><div class="io-item"><span>OUTPUT / 输出</span><code>${escape(stage.output)}</code></div></div><div class="code-block"><button type="button" class="copy-button" id="copy-command">复制</button><pre id="command-text">${escape(stage.example)}</pre></div></div>`;
  }
  $$('[data-pipe]').forEach(button => button.addEventListener('click',()=>selectPipeline(button.dataset.pipe)));
  $('#pipeline-nodes').addEventListener('click', event => {
    const button=event.target.closest('[data-stage]'); if(!button)return;
    stageIndex=Number(button.dataset.stage); selectPipeline(pipe);
  });
  $('#stage-detail').addEventListener('click', async event => {
    if(!event.target.closest('#copy-command'))return;
    const button=$('#copy-command');
    try { await navigator.clipboard.writeText($('#command-text').textContent); button.textContent='已复制'; }
    catch { const range=document.createRange(); range.selectNodeContents($('#command-text')); const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range); button.textContent='已选中'; }
    setTimeout(()=>{if(button.isConnected)button.textContent='复制';},2000);
  });

  $('#category-buttons').innerHTML = `<button type="button" data-group="all" class="active" aria-pressed="true">全部</button>` + Object.entries(data.groups).map(([key,value])=>`<button type="button" data-group="${key}" aria-pressed="false">${key} · ${value}</button>`).join('');
  function renderCatalog() {
    const query=$('#capability-search').value.trim().toLowerCase();
    const items=data.capabilities.filter(item=>(activeGroup==='all'||item.group===activeGroup)&&`${item.title} ${item.description} ${item.commands.join(' ')} ${item.state||''}`.toLowerCase().includes(query));
    $('#catalog-result').textContent=`显示 ${items.length} / ${data.capabilities.length} 项能力${query?` · 关键词：${query}`:''}`;
    $('#empty-result').hidden=items.length!==0;
    $('#capability-grid').innerHTML=items.map(item=>`<article class="capability-card"><div class="card-top"><span class="group-tag">${item.group} / ${data.groups[item.group]}</span><span class="state ${item.state==='本机已验证'?'local':item.state?.startsWith('实验')?'experimental':''}">${escape(item.state||'文档 / 源码核查')}</span></div><h2>${escape(item.title)}</h2><p>${escape(item.description)}</p><div class="command-chips">${item.commands.map(cmd=>`<code>${escape(cmd)}</code>`).join('')}</div><a href="${source(item.doc)}" target="_blank" rel="noreferrer">查看一手来源</a></article>`).join('');
    $$('[data-group]').forEach(button=>{const active=button.dataset.group===activeGroup;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  }
  $('#category-buttons').addEventListener('click',event=>{const button=event.target.closest('[data-group]');if(button){activeGroup=button.dataset.group;renderCatalog();}});
  $('#capability-search').addEventListener('input',renderCatalog);
  $('#clear-search').addEventListener('click',()=>{activeGroup='all';$('#capability-search').value='';renderCatalog();$('#capability-search').focus();});

  const demo=window.SPRITE_DEMO;
  if(demo) initializeDemo(demo);
  function initializeDemo(demo) {
    const canvas=$('#frame-player'); const context=canvas.getContext('2d');
    const atlas=new Image(); let frame=0;let playing=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;let fps=demo.fps;let last=0;
    const frames=demo.frames;
    canvas.width=demo.cellWidth||256;canvas.height=demo.cellHeight||256;
    const frameButtons=frames.map((_,index)=>`<button type="button" data-frame="${index}" aria-label="第 ${index+1} 帧" aria-pressed="${index===0}" class="${index===0?'active':''}">${index+1}</button>`).join('');
    $('#frame-buttons').innerHTML=frameButtons;
    $('#play-toggle').textContent=playing?'暂停':'播放';
    $('#fps').value=String(fps);$('#fps-value').textContent=`${fps} fps`;
    atlas.onload=draw; atlas.src=demo.images.alpha;
    atlas.onerror=()=>{$('#frame-info').textContent='图集未加载';$('#play-toggle').disabled=true;};
    function draw(){if(!atlas.complete||!atlas.naturalWidth)return;const rect=frames[frame];context.clearRect(0,0,canvas.width,canvas.height);context.imageSmoothingEnabled=false;context.drawImage(atlas,rect.x,rect.y,rect.w,rect.h,0,0,canvas.width,canvas.height);$('#frame-info').textContent=`FRAME ${String(frame+1).padStart(2,'0')} / ${frames.length}`;$$('[data-frame]').forEach(button=>{const active=Number(button.dataset.frame)===frame;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
    function tick(now){if(playing&&currentView==='examples'&&!document.hidden&&now-last>1000/fps){frame=(frame+1)%frames.length;draw();last=now;}requestAnimationFrame(tick);}
    requestAnimationFrame(tick);
    $('#play-toggle').addEventListener('click',()=>{playing=!playing;last=performance.now();$('#play-toggle').textContent=playing?'暂停':'播放';});
    $('#next-frame').addEventListener('click',()=>{playing=false;$('#play-toggle').textContent='播放';frame=(frame+1)%frames.length;draw();});
    $('#fps').addEventListener('input',event=>{fps=Number(event.target.value);$('#fps-value').textContent=`${fps} fps`;});
    $('#frame-buttons').addEventListener('click',event=>{const button=event.target.closest('[data-frame]');if(!button)return;playing=false;$('#play-toggle').textContent='播放';frame=Number(button.dataset.frame);draw();});
    $('#local-atlas').src=demo.images.input;
    $$('[data-local-image]').forEach(button=>{if(!demo.images[button.dataset.localImage])button.hidden=true;button.addEventListener('click',()=>{$('#local-atlas').src=demo.images[button.dataset.localImage];$$('[data-local-image]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});});});
    $('#local-metrics').innerHTML=`<div><strong>${frames.length}</strong><span>透明帧</span></div><div><strong>${demo.sheetWidth} × ${demo.sheetHeight}</strong><span>输出图集尺寸</span></div><div><strong>${demo.alphaPercent??'—'}%</strong><span>完全透明像素</span></div>`;
    $('#artifact-links').innerHTML=demo.artifacts.map(item=>`<a href="${escape(item.path)}" target="_blank" rel="noreferrer" download>${escape(item.title)}</a>`).join('');
    $('#validation-list').innerHTML=demo.stages.map((stage,index)=>`<div class="validation-row"><span class="number">${String(index+1).padStart(2,'0')}</span><div><strong>${escape(stage.name)}</strong><p><code>${escape(stage.command)}</code></p></div><span class="badge mint">已验证</span></div>`).join('');
    $('#verified-scope').textContent=demo.scope;
  }
  renderCatalog();selectPipeline('B');route();
})();
