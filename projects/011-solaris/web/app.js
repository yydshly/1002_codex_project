(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const officialUrl = 'https://runway.com/news/research/introducing-solaris';
  const paperUrl = 'https://arxiv.org/html/2609.00776v1';
  const state = { scenes: [], capabilities: [], levels: new Map(), families: [], sceneId: null, capabilityId: null, family: '', query: '', evidence: '', mediaRevision: 0 };
  const levelDefaults = new Map([
    ['official-figure', '论文图示'], ['official-comparison', '官方对比任务'],
    ['official-description', '官方文字描述'], ['official-prospect', '官方设想'],
    ['official-video', '官方回放观察']
  ]);
  const kindLabels = { video: '官方录制', figure: '静态证据', text: '文字资料' };
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function safeUrl(value, fallback = officialUrl) {
    if (typeof value !== 'string' || !value) return fallback;
    try { const parsed = new URL(value); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : fallback; }
    catch { return fallback; }
  }
  function link(text, url, className) {
    const anchor = node('a', className, text);
    anchor.href = safeUrl(url);
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }
  function announce(text) { byId('announcement').textContent = text; }
  function sceneFor(capability) {
    return state.scenes.find(scene => scene.id === capability.sceneId) || state.scenes.find(scene => capability.sceneIds?.includes(scene.id));
  }
  function capabilitiesFor(scene) {
    return state.capabilities.filter(capability => capability.sceneId === scene.id || capability.sceneIds?.includes(scene.id));
  }
  function levelLabel(level) { return state.levels.get(level)?.label || levelDefaults.get(level) || '来源待核实'; }
  function currentScene() { return state.scenes.find(scene => scene.id === state.sceneId); }
  function addLabelText(parent, label, text, className = 'detail-section') {
    const section = node('div', className);
    section.append(node('h4', '', label), node('p', '', text || '公开资料未披露，需进一步验证。'));
    parent.append(section);
  }
  function sceneShortTitle(scene) { return scene.title.split(/[：:]/)[0]; }
  function renderRail() {
    byId('scene-rail').replaceChildren(...state.scenes.map((scene, index) => {
      const button = node('button', 'scene-tile');
      button.type = 'button';
      button.dataset.sceneId = scene.id;
      button.setAttribute('aria-pressed', String(scene.id === state.sceneId));
      button.setAttribute('aria-label', `${scene.title}，${kindLabels[scene.kind] || '公开资料'}`);
      const preview = node('div', `scene-tile-preview${scene.posterUrl && scene.posterUrl.includes('arxiv.org') ? ' paper-preview' : ''}`);
      if (scene.posterUrl) {
        const image = node('img');
        image.src = safeUrl(scene.posterUrl);
        image.alt = '';
        image.loading = index < 6 ? 'eager' : 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => image.remove(), { once: true });
        preview.append(image);
      }
      preview.append(node('span', 'tile-index', String(index + 1).padStart(2, '0')), node('span', 'tile-type', kindLabels[scene.kind] || '公开资料'));
      const caption = node('div', 'tile-caption');
      caption.append(node('strong', '', sceneShortTitle(scene)), node('small', '', `${capabilitiesFor(scene).length || scene.interactions?.length || 0} 项研究线索`));
      button.append(preview, caption);
      button.addEventListener('click', () => selectScene(scene.id, true));
      return button;
    }));
  }
  function mediaChoices(scene) {
    const choices = [];
    if (scene.kind === 'video' && scene.videoUrl) choices.push({ type: 'video', url: scene.videoUrl, label: '官方录制回放', caption: `${scene.mediaStatus}。视频由 Runway 发布；本页播放原始录制，不响应场景拖拽。`, sourceUrl: scene.sourceUrl });
    if (scene.kind !== 'video' && scene.posterUrl && scene.posterUrl !== scene.figureUrl) choices.push({ type: 'image', url: scene.posterUrl, label: '官方静帧', caption: '官方播放器封面。此处展示静态画面，不是可操作的模型环境。', sourceUrl: scene.sourceUrl });
    if (scene.figureUrl) choices.push({ type: 'image', url: scene.figureUrl, label: '论文过程图', caption: '论文原图：整组输出静帧。点击切换只是浏览证据；需放大原图查看细节。', sourceUrl: paperUrl });
    if (Array.isArray(scene.additionalFigureUrls)) scene.additionalFigureUrls.forEach((url, index) => choices.push({ type: 'image', url, label: `论文过程图 ${index + 2}`, caption: '同一场景的另一组论文输出静帧；原图保留完整帧序列。', sourceUrl: paperUrl }));
    if (!choices.length && scene.posterUrl) choices.push({ type: 'image', url: scene.posterUrl, label: '公开静帧', caption: '来自官方资料的静态证据；本页不模拟该场景的模型输出。', sourceUrl: scene.sourceUrl });
    if (!choices.length) choices.push({ type: 'text', label: '官方文字说明', caption: scene.mediaStatus, sourceUrl: scene.sourceUrl });
    return choices;
  }
  function showMediaError(stage, scene, text) {
    if (stage.querySelector('.media-error')) return;
    const error = node('div', 'media-error');
    error.setAttribute('role', 'status');
    error.append(node('p', '', text), link('打开官方页面查看原始演示 ↗', scene.sourceUrl));
    stage.append(error);
  }
  function renderMedia(scene, choice, selectedIndex) {
    const stage = byId('media-stage');
    const revision = ++state.mediaRevision;
    const isCurrent = media => revision === state.mediaRevision && stage.contains(media);
    const previous = stage.querySelector('video');
    if (previous) {
      previous.pause();
      previous.querySelectorAll('source').forEach(source => source.remove());
      previous.removeAttribute('src');
      previous.load();
    }
    stage.replaceChildren();
    stage.classList.toggle('figure-stage', choice.type === 'image');
    stage.classList.toggle('text-stage', choice.type === 'text');
    byId('media-kind').textContent = choice.type === 'video' ? 'RUNWAY / 官方录制回放' : choice.type === 'image' ? (choice.url.includes('arxiv.org') ? 'PAPER / 论文原图 · 静态证据' : 'RUNWAY / 官方封面 · 静态证据') : 'SOURCE / 官方文字说明';
    byId('media-caption').textContent = choice.caption;
    const source = byId('media-source');
    source.href = safeUrl(choice.type === 'image' ? choice.url : choice.sourceUrl);
    source.textContent = choice.type === 'image' ? '放大原始图片 ↗' : choice.type === 'video' ? '打开官方演示 ↗' : '阅读原始说明 ↗';
    if (choice.type === 'video') {
      const video = node('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('aria-label', `${scene.title}，Runway 官方演示录像`);
      if (scene.posterUrl) video.poster = safeUrl(scene.posterUrl);
      video.addEventListener('error', () => {
        if (isCurrent(video)) showMediaError(stage, scene, '浏览器未能加载官方视频。请打开官方页面查看；本页不会以静帧冒充动态回放。');
      }, { once: true });
      const mediaSource = node('source');
      mediaSource.src = safeUrl(choice.url);
      mediaSource.type = 'video/mp4';
      mediaSource.addEventListener('error', () => {
        if (isCurrent(video)) showMediaError(stage, scene, '官方视频当前无法在此浏览器播放，可从原始页面继续查看。');
      }, { once: true });
      video.append(mediaSource, link('打开官方演示', scene.sourceUrl));
      stage.append(video);
    } else if (choice.type === 'image') {
      const image = node('img');
      image.alt = `${scene.title}的${choice.label}，来自官方资料`;
      image.src = safeUrl(choice.url);
      image.decoding = 'async';
      image.addEventListener('error', () => {
        if (!isCurrent(image)) return;
        image.style.visibility = 'hidden';
        showMediaError(stage, scene, '官方原图未能加载。可打开原始来源核查，当前画面不替换为生成图片。');
      }, { once: true });
      stage.append(image);
    } else {
      const fallback = node('div', 'media-text-only');
      const copy = node('div');
      copy.append(node('p', 'eyebrow', '文字证据 / 无对应演示'), node('h4', '', '这个场景只有公开文字。'), node('p', '', scene.evidence), link('到官方原文核查 ↗', scene.sourceUrl));
      fallback.append(copy);
      stage.append(fallback);
    }
    byId('media-options').querySelectorAll('button').forEach((button, index) => button.setAttribute('aria-pressed', String(index === selectedIndex)));
  }
  function renderMediaOptions(scene) {
    const choices = mediaChoices(scene);
    byId('media-options').replaceChildren(...choices.map((choice, index) => {
      const button = node('button', 'media-option', choice.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === 0));
      button.addEventListener('click', () => { renderMedia(scene, choice, index); announce(`已切换到${scene.title}的${choice.label}。`); });
      return button;
    }));
    renderMedia(scene, choices[0], 0);
  }
  function renderSceneOperationDetail(scene, capability, interaction) {
    const detail = byId('scene-operation-detail');
    detail.replaceChildren();
    if (capability) {
      detail.append(node('span', 'micro-label', `输入 / ${levelLabel(capability.evidenceLevel)}`), node('p', '', capability.gesture), node('span', 'micro-label', '公开结果'), node('p', '', capability.observed));
      const research = node('a', '', '读完整研究与验证问题 →');
      research.href = '#capabilities';
      research.addEventListener('click', () => {
        selectCapability(capability.id, { reveal: true });
      });
      detail.append(research);
    } else {
      detail.append(node('span', 'micro-label', '观察线索'), node('p', '', interaction || scene.description), node('span', 'micro-label', '来源与状态'), node('p', '', scene.evidence));
    }
  }
  function renderSceneOperations(scene) {
    const evidencePriority = ['official-video-observation', 'official-video', 'official-figure', 'official-comparison', 'official-description', 'official-prospect'];
    const capabilities = capabilitiesFor(scene).sort((first, second) => {
      const firstRank = evidencePriority.indexOf(first.evidenceLevel);
      const secondRank = evidencePriority.indexOf(second.evidenceLevel);
      return (firstRank < 0 ? 99 : firstRank) - (secondRank < 0 ? 99 : secondRank);
    });
    const operations = capabilities.length ? capabilities : scene.interactions || [];
    byId('scene-operation-count').textContent = String(operations.length).padStart(2, '0');
    let selected = operations.find(capability => capability.id === state.capabilityId) || operations[0];
    byId('scene-operations').replaceChildren(...operations.map(operation => {
      const capability = typeof operation === 'string' ? null : operation;
      const button = node('button', 'scene-operation');
      button.type = 'button';
      const label = node('span', '', capability ? capability.name : operation);
      if (capability && ['official-description', 'official-prospect'].includes(capability.evidenceLevel)) label.append(node('small', 'operation-text-note', ` · ${levelLabel(capability.evidenceLevel)}`));
      button.append(label);
      button.setAttribute('aria-pressed', String(operation === selected));
      button.addEventListener('click', () => {
        byId('scene-operations').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        if (capability) selectCapability(capability.id);
        renderSceneOperationDetail(scene, capability, operation);
        announce(`已选择${capability ? capability.name : operation}的证据导读；回放时间没有改变。`);
      });
      return button;
    }));
    renderSceneOperationDetail(scene, typeof selected === 'string' ? null : selected, typeof selected === 'string' ? selected : null);
  }
  function selectScene(id, scrollTile = false) {
    const scene = state.scenes.find(item => item.id === id);
    if (!scene) return;
    state.sceneId = id;
    const index = state.scenes.indexOf(scene);
    byId('scene-counter').textContent = `${String(index + 1).padStart(2, '0')} / ${String(state.scenes.length).padStart(2, '0')} 场景 · ${scene.mediaStatus}`;
    byId('scene-number').textContent = `SCENE ${String(index + 1).padStart(2, '0')}`;
    byId('selected-scene-title').textContent = sceneShortTitle(scene);
    byId('scene-description').textContent = scene.description;
    byId('scene-rail').querySelectorAll('.scene-tile').forEach(button => {
      const selected = button.dataset.sceneId === id;
      button.setAttribute('aria-pressed', String(selected));
      if (selected && scrollTile) {
        const rail = byId('scene-rail');
        rail.scrollTo({ left: button.offsetLeft - rail.offsetLeft - 3, behavior: 'instant' });
      }
    });
    renderMediaOptions(scene);
    renderSceneOperations(scene);
    announce(`已切换至${scene.title}，${scene.mediaStatus}。`);
  }
  function renderFilters(data) {
    state.levels = new Map((data.evidenceLevels || []).map(level => [level.id, level]));
    const levels = data.evidenceLevels || [...new Set(state.capabilities.map(item => item.evidenceLevel))].map(id => ({ id, label: levelDefaults.get(id) || id }));
    byId('evidence-filter').replaceChildren(node('option', '', '全部证据'), ...levels.map(level => {
      const option = node('option', '', level.label); option.value = level.id; return option;
    }));
    byId('evidence-filter').firstElementChild.value = '';
    const declared = (data.families || []).map(family => typeof family === 'string' ? family : family.label);
    state.families = [...new Set([...declared, ...state.capabilities.map(capability => capability.family)])].filter(Boolean);
    byId('family-filters').replaceChildren(...['', ...state.families].map(family => {
      const button = node('button', 'family-filter');
      button.type = 'button';
      button.dataset.family = family;
      button.setAttribute('aria-pressed', String(family === state.family));
      button.append(node('span', '', family || '全部能力'));
      button.firstChild.className = '';
      const count = family ? state.capabilities.filter(item => item.family === family).length : state.capabilities.length;
      button.append(node('span', '', count));
      button.addEventListener('click', () => {
        state.family = family;
        byId('family-filters').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        renderInventory();
      });
      return button;
    }));
  }
  function filteredCapabilities() {
    const query = state.query.trim().toLocaleLowerCase();
    return state.capabilities.filter(capability => {
      const searchText = [capability.id, capability.name, capability.gesture, capability.family, capability.observed, capability.mechanism, capability.verification, sceneFor(capability)?.title].filter(Boolean).join(' ').toLocaleLowerCase();
      return (!state.family || capability.family === state.family) && (!state.evidence || capability.evidenceLevel === state.evidence) && (!query || searchText.includes(query));
    });
  }
  function renderInventory() {
    const capabilities = filteredCapabilities();
    byId('inventory-count').textContent = `${capabilities.length} / ${state.capabilities.length} 项公开条目 · ${state.families.length} 个能力族`;
    if (!capabilities.length) {
      byId('capability-list').replaceChildren(node('p', 'empty-results', '没有匹配的条目。试试减少筛选条件，或搜索“拖动”“光照”“沙发”。'));
      state.capabilityId = null;
      byId('capability-detail').replaceChildren(node('p', 'eyebrow', '当前筛选 / 无匹配结果'), node('h3', '', '暂无对应能力。'), node('p', '', '调整关键词、能力族或证据等级后，可继续查看对应条目的研究详情。'));
      return;
    }
    byId('capability-list').replaceChildren(...capabilities.map(capability => {
      const button = node('button', 'capability-row');
      button.type = 'button';
      button.dataset.capabilityId = capability.id;
      button.setAttribute('aria-pressed', String(capability.id === state.capabilityId));
      const title = node('div', 'row-description');
      title.append(node('span', 'row-title', capability.name), node('span', 'row-gesture', capability.gesture));
      const evidence = node('span', 'row-evidence');
      evidence.append(node('strong', '', levelLabel(capability.evidenceLevel)), node('small', '', sceneFor(capability) ? sceneShortTitle(sceneFor(capability)) : '公开方法'));
      button.append(node('span', 'row-number', capability.id), title, evidence);
      button.addEventListener('click', () => selectCapability(capability.id, { mobileReveal: true }));
      return button;
    }));
    if (!capabilities.some(capability => capability.id === state.capabilityId)) selectCapability(capabilities[0].id);
  }
  function selectCapability(id, options = {}) {
    const capability = state.capabilities.find(item => item.id === id);
    if (!capability) return;
    state.capabilityId = capability.id;
    byId('capability-list').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.capabilityId === id)));
    const detail = byId('capability-detail');
    const scene = sceneFor(capability);
    detail.replaceChildren(node('p', 'eyebrow', `${capability.id} / ${capability.family}`), node('h3', '', capability.name), node('p', 'detail-meta', `${levelLabel(capability.evidenceLevel)} · ${scene ? sceneShortTitle(scene) : '公开方法'} · 未实测模型`));
    addLabelText(detail, '鼠标动作 / 输入', capability.gesture);
    addLabelText(detail, '官方展示或描述', capability.observed);
    addLabelText(detail, '作用机制与关联效果 · 研究分析', capability.mechanism);
    addLabelText(detail, '真实接入后如何验证', capability.verification);
    const source = node('div', 'detail-source');
    source.append(node('p', '', capability.sourceSection), link('核查该条目的原始来源 ↗', capability.sourceUrl));
    const meaning = state.levels.get(capability.evidenceLevel)?.meaning;
    if (meaning) source.append(node('p', '', meaning));
    detail.append(source);
    if (scene) {
      const actions = node('div', 'detail-actions');
      const gotoScene = node('a', 'detail-scene-button');
      gotoScene.href = '#demo';
      gotoScene.append(node('span', '', scene.kind === 'video' ? '查看相关官方回放' : scene.kind === 'figure' ? '查看相关静态证据' : '查看相关文字资料'), node('span', '', '↗'));
      gotoScene.addEventListener('click', () => selectScene(scene.id, true));
      actions.append(gotoScene, node('p', 'detail-link', '场景媒体与这条能力的证据等级分别标注。文字条目不会因同场景存在录像而升级为实证。'));
      detail.append(actions);
    }
    if (options.reveal || (options.mobileReveal && window.matchMedia('(max-width:620px)').matches)) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    announce(`已打开${capability.name}的输入、证据、机制分析与验证问题。`);
  }
  async function readData(file) {
    const response = await fetch(file, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    return response.json();
  }
  byId('rail-prev').addEventListener('click', () => byId('scene-rail').scrollBy({ left: -440, behavior: 'smooth' }));
  byId('rail-next').addEventListener('click', () => byId('scene-rail').scrollBy({ left: 440, behavior: 'smooth' }));
  byId('capability-search').addEventListener('input', event => { state.query = event.target.value; renderInventory(); });
  byId('evidence-filter').addEventListener('change', event => { state.evidence = event.target.value; renderInventory(); });
  byId('reset-filters').addEventListener('click', () => {
    state.query = ''; state.family = ''; state.evidence = '';
    byId('capability-search').value = ''; byId('evidence-filter').value = '';
    byId('family-filters').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.family === '')));
    renderInventory();
  });
  Promise.allSettled([readData('scenes.json'), readData('capabilities.json')]).then(([sceneResult, capabilityResult]) => {
    if (sceneResult.status === 'fulfilled') {
      state.scenes = sceneResult.value.scenes || [];
      state.sceneId = state.scenes.find(scene => scene.id === 'interior')?.id || state.scenes[0]?.id;
    } else {
      byId('media-stage').replaceChildren(node('p', 'data-error', '场景目录未能加载。请通过 HTTP 预览服务打开此页，或直接阅读 Runway 官方资料。'));
      byId('scene-counter').textContent = '场景目录加载失败';
    }
    if (capabilityResult.status === 'fulfilled') {
      state.capabilities = capabilityResult.value.capabilities || [];
      renderFilters(capabilityResult.value);
      state.capabilityId = state.capabilities[0]?.id;
      renderInventory();
      if (state.capabilityId) selectCapability(state.capabilityId);
    } else {
      byId('capability-list').replaceChildren(node('p', 'data-error', '能力目录未能加载。请检查同目录 capabilities.json 是否存在，并从本地 HTTP 预览服务打开此页。'));
      byId('inventory-count').textContent = '能力目录加载失败';
    }
    if (state.scenes.length) { renderRail(); selectScene(state.sceneId); }
  }).catch(() => announce('资料加载遇到错误，可直接通过各原始来源链接阅读官方资料。'));
})();
