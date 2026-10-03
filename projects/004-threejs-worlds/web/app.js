import { capabilities, useCases, pipeline } from './lessons.js';
import { initNetworkDemo } from './network.js';
import { referenceValues } from './value.js';
import { initShowcase } from './showcase.js';
import { initUnderstanding } from './understanding.js';

const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const text = (selector, value) => { $(selector).textContent = value; };
const scenes = {
  harbour: { name: '有风的港湾', kicker: 'THE HARBOUR', description: '码头、陶土屋顶与一片会发光的海。', number: '01' },
  coast: { name: '松林与海岸', kicker: 'SOLSTICE COAST', description: '沿着木栈道，走向树影之外的开阔水面。', number: '02' },
  observatory: { name: '星光观测台', kicker: 'SABLE OBSERVATORY', description: '黄铜、石阶与圆顶，留一段时间给天空。', number: '03' },
};
const cameras = { orbit: '鸟瞰镜头', third: '第三人称', first: '第一人称' };
const lightNames = { dawn: '暖金晨光', day: '清朗午后', dusk: '静谧蓝调' };
const icons = ['◈', '≈', '☀', '↝', '⋮', '⌖'];
let world, worldPromise, camera = 'orbit', currentWorld = 'harbour', isPaused = false, errorReported = false;
let view = 'showcase', referenceWorld = 'solstice', originalTimer;
const referenceWorlds = {
  porto: { name: 'Porto Lume / 港湾小镇', focus: '观察建筑、街道与码头如何组成路线；用人物尺度判断空间，再试试第一人称。' },
  solstice: { name: 'Solstice Coast / 松林海岸', focus: '看海面反射与松林层次；切换光照，观察同一空间如何改变情绪。' },
  astral: { name: 'Sable Observatory / 天文台', focus: '观察石材、玻璃与黄铜的质感；从地标、台阶和入口理解空间引导。' },
};
const network = initNetworkDemo($('#network-demo'));
const showcase = initShowcase($('#showcase-view'));
const guideDialog = $('#guide-live-dialog');
let guideHome, guideTrigger;
function restoreGuideScene() {
  if (guideHome) { guideHome.replaceWith($('#showcase-view')); guideHome = null; }
  document.body.classList.remove('guide-modal-open');
  if (guideTrigger?.isConnected) guideTrigger.focus({ preventScroll: true });
}
guideDialog.addEventListener('close', restoreGuideScene);
$('#guide-live-close').addEventListener('click', () => guideDialog.close());
initUnderstanding({
  async onDemo(kind) {
    guideTrigger = document.activeElement;
    await setView('showcase');
    if (view !== 'showcase' || !(await showcase.preview(kind))) return;
    guideHome = document.createComment('art garden original location');
    $('#showcase-view').before(guideHome);
    $('#guide-live-body').append($('#showcase-view'));
    document.body.classList.add('guide-modal-open');
    guideDialog.showModal();
    $('#park-canvas').focus({ preventScroll: true });
  },
  onSource() { referenceWorld = 'solstice'; setView('original', true); },
  onCapability() { applyCapability(capabilities.find(item => item.id === 'motion')); },
});

function referenceURL() { return `https://porto-lume-worlds.vercel.app/#world=${referenceWorld}&room=commons`; }
function connectOriginal(force = false) {
  const url = referenceURL();
  $('#original-direct').href = url;
  text('#original-world-name', referenceWorlds[referenceWorld].name);
  text('#observation-focus', referenceWorlds[referenceWorld].focus);
  activeButtons('[data-reference-world]', 'referenceWorld', referenceWorld);
  if (view !== 'original' || (!force && $('#original-frame').getAttribute('src') === url)) return;
  clearTimeout(originalTimer);
  $('#original-loading').hidden = false; $('#original-fallback').hidden = true;
  text('#original-status', '正在连接 Porto Lume 原站；场景、角色、设置与房间功能均来自原作。');
  // Replace the browsing context so stale load events cannot dismiss a newer world's loading state.
  const frame = $('#original-frame').cloneNode(false);
  frame.addEventListener('load', () => {
    if (view !== 'original' || frame !== $('#original-frame')) return;
    clearTimeout(originalTimer); $('#original-loading').hidden = true;
    text('#original-status', '原站已响应。点击画面中的 Walk / Start walking 进入；若画面异常，可在独立窗口打开。');
  }, { once: true });
  frame.src = url; $('#original-frame').replaceWith(frame);
  originalTimer = setTimeout(() => {
    $('#original-loading').hidden = true; $('#original-fallback').hidden = false;
    text('#original-status', '原站暂未完成响应，可重试或使用独立窗口。');
  }, 25000);
}
async function setView(next, scroll = false, updateHash = true) {
  if (guideDialog.open) guideDialog.close();
  view = next;
  activeButtons('[data-view]', 'view', next);
  $('#showcase-view').hidden = next !== 'showcase';
  $('#original-view').hidden = next !== 'original';
  $('#playground').hidden = next !== 'lab';
  if (next !== 'showcase') showcase.setActive(false);
  if (next !== 'lab') world?.setActive(false);
  if (next === 'original') {
    connectOriginal();
  } else {
    clearTimeout(originalTimer);
    $('#original-frame').src = 'about:blank';
    if (next === 'showcase') await showcase.setActive(true);
    else { await ensureWorld(); world?.setActive(view === 'lab'); }
  }
  if (view !== next) return;
  if (updateHash) history.replaceState(null, '', `${location.pathname}${location.search}#source=${next}&world=${next === 'original' ? referenceWorld : next === 'showcase' ? 'art-garden' : currentWorld}${next === 'original' ? '&room=commons' : ''}`);
  if (scroll) $('#experience').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}

all('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view, true)));
all('[data-reference-world]').forEach(button => button.addEventListener('click', () => {
  referenceWorld = button.dataset.referenceWorld; connectOriginal();
  history.replaceState(null, '', `${location.pathname}${location.search}#source=original&world=${referenceWorld}&room=commons`);
}));
all('[data-open-lab]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); setView('lab', true); }));
all('a[href="#experience"]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); setView(link.hasAttribute('data-open-original') ? 'original' : 'showcase', true); }));
$('#original-retry').addEventListener('click', () => connectOriginal(true));
$('#original-fullscreen').addEventListener('click', async () => {
  try { await $('#original-frame-wrap').requestFullscreen(); }
  catch { text('#original-status', '当前浏览器无法开启嵌入全屏，请使用独立窗口体验。'); }
});
$('#original-exit-fullscreen').addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
});

referenceValues.forEach((item, index) => {
  const article = document.createElement('article'); article.className = 'value-card';
  const heading = document.createElement('div'); heading.className = 'value-card-top';
  heading.append(Object.assign(document.createElement('span'), { textContent: `0${index + 1}` }), Object.assign(document.createElement('small'), { textContent: item.priority }));
  article.append(heading, Object.assign(document.createElement('h3'), { textContent: item.title }));
  for (const [label, field] of [['看到的效果', 'effect'], ['背后的原理', 'mechanism'], ['提取的价值', 'value'], ['可用场景', 'scenario'], ['投入判断', 'cost']]) {
    const row = document.createElement('div'); row.className = `value-row value-${field}`;
    row.append(Object.assign(document.createElement('strong'), { textContent: label }), Object.assign(document.createElement('p'), { textContent: item[field].replace(/^(原作观察|原作画面|发布代码证据|实现证据|迁移判断)：/, '') }));
    article.append(row);
  }
  $('#reference-values').append(article);
});

function announce(message) { text('#app-status', message); }
function activeButtons(selector, attr, value) {
  all(selector).forEach(button => {
    const active = button.dataset[attr] === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function setWorld(id, updateHash = true) {
  if (!scenes[id]) return;
  currentWorld = id;
  world?.setWorld(id);
  const scene = scenes[id];
  text('#scene-name', scene.name); text('#scene-kicker', scene.kicker);
  text('#scene-description', scene.description); text('#world-number', `WORLD ${scene.number} / 03`);
  activeButtons('[data-world]', 'world', id);
  $('#hotspot').hidden = true;
  if (updateHash) history.replaceState(null, '', `${location.pathname}${location.search}#source=lab&world=${id}`);
}
function setCamera(mode, focus = false) {
  camera = mode;
  world?.setCamera(mode);
  $('#camera-button').replaceChildren(document.createTextNode(`${cameras[mode]} `), Object.assign(document.createElement('kbd'), { textContent: 'V' }));
  $('.canvas-frame').classList.toggle('walking', mode !== 'orbit');
  text('#scene-hint', mode === 'orbit' ? '拖动旋转 · 滚轮缩放 · 点击场景中的标记' : 'WASD 移动 · SHIFT 奔跑 · 拖动观察');
  $('#walk-button').innerHTML = mode === 'orbit' ? '开始漫游 <span>↗</span>' : '回到鸟瞰 <span>↗</span>';
  if (focus) $('#world-canvas').focus({ preventScroll: true });
}
function setLight(id) {
  world?.setLight(id); activeButtons('[data-light]', 'light', id); text('#light-label', lightNames[id]);
}
function togglePause(value) {
  isPaused = value;
  world?.setPlaying(!value);
  $('#pause-button').setAttribute('aria-pressed', String(value));
  text('#pause-button', value ? '继续画面' : '暂停画面');
  announce(value ? '动画已暂停，仍可调整场景参数。' : '实时动画已恢复。');
}
async function applyCapability(capability) {
  await setView('lab', false, false);
  if (view !== 'lab') return;
  all('.capability-card').forEach(card => {
    const active = card.dataset.capability === capability.id;
    card.classList.toggle('active', active); card.setAttribute('aria-pressed', String(active));
  });
  setWorld(capability.scene); setCamera(capability.camera, true);
  if (capability.id === 'motion' && isPaused) togglePause(false);
  $('#wireframe').checked = false; world?.setWireframe(false);
  if (capability.id === 'lighting') setLight('dusk');
  if (capability.id === 'instancing') {
    $('#tree-count').value = '400'; text('#tree-value', '400 棵'); world?.setPopulation(400);
  }
  $('#experiment-tip p').textContent = capability.tryThis;
  announce(`${capability.label} · ${capability.tryThis}`);
  $('#playground').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}

capabilities.forEach((capability, index) => {
  const card = document.createElement('button');
  card.type = 'button'; card.className = 'capability-card'; card.dataset.capability = capability.id;
  card.setAttribute('aria-pressed', 'false');
  const top = document.createElement('div'); top.className = 'capability-top';
  top.append(Object.assign(document.createElement('span'), { className: 'capability-icon', textContent: icons[index] }), Object.assign(document.createElement('span'), { className: 'capability-number', textContent: `0${index + 1}` }));
  card.append(top, Object.assign(document.createElement('span'), { className: 'capability-label', textContent: capability.label }), Object.assign(document.createElement('h3'), { textContent: capability.title }), Object.assign(document.createElement('p'), { textContent: capability.description }));
  const principle = document.createElement('p'); principle.className = 'card-principle'; principle.textContent = capability.principle; card.append(principle);
  const tryLabel = document.createElement('span'); tryLabel.append(document.createTextNode('在实验场试一试'), Object.assign(document.createElement('span'), { textContent: '↗', ariaHidden: 'true' })); card.append(tryLabel);
  card.addEventListener('click', () => applyCapability(capability)); $('#capability-grid').append(card);
});
useCases.forEach((useCase, index) => {
  const article = document.createElement('article'); article.className = 'use-case';
  article.append(Object.assign(document.createElement('span'), { textContent: `0${index + 1}` }), Object.assign(document.createElement('h3'), { textContent: useCase.title }), Object.assign(document.createElement('p'), { textContent: useCase.description }), Object.assign(document.createElement('small'), { textContent: useCase.examples })); $('#use-case-grid').append(article);
});
pipeline.forEach((step, index) => {
  const row = document.createElement('div'); row.className = 'pipeline-step';
  const content = document.createElement('div'); content.append(Object.assign(document.createElement('strong'), { textContent: step.title }), Object.assign(document.createElement('p'), { textContent: step.description }));
  row.append(Object.assign(document.createElement('span'), { textContent: `0${index + 1}` }), content); $('#render-pipeline').append(row);
});

all('[data-world]').forEach(button => button.addEventListener('click', () => { setWorld(button.dataset.world); announce(`已切换到${scenes[currentWorld].name}。`); }));
all('[data-light]').forEach(button => button.addEventListener('click', () => setLight(button.dataset.light)));
$('#camera-button').addEventListener('click', () => setCamera({ orbit: 'third', third: 'first', first: 'orbit' }[camera], true));
$('#walk-button').addEventListener('click', () => { setCamera(camera === 'orbit' ? 'third' : 'orbit', true); if (camera !== 'orbit' && isPaused) togglePause(false); announce(camera === 'orbit' ? '拖动镜头观察整个世界。' : '场景已获得键盘焦点，使用 WASD 开始移动。'); });
$('#pause-button').addEventListener('click', () => togglePause(!isPaused));
$('#roughness').addEventListener('input', event => { const value = Number(event.target.value); text('#roughness-value', value.toFixed(2)); world?.setRoughness(value); });
$('#tree-count').addEventListener('input', event => { const value = Number(event.target.value); text('#tree-value', `${value} 棵`); world?.setPopulation(value); });
$('#wireframe').addEventListener('change', event => world?.setWireframe(event.target.checked));
$('#shadows').addEventListener('change', event => world?.setShadows(event.target.checked));
$('#instancing').addEventListener('change', event => { world?.setInstancing(event.target.checked); announce(event.target.checked ? '相同树木正在批量绘制，观察绘制调用数。' : '每棵树分别提交绘制，比较绘制调用数。'); });
$('#wave-button').addEventListener('click', () => { setCamera('third', true); if (isPaused) togglePause(false); world?.wave(); announce('角色正在挥手，仍可用 WASD 移动。'); });
$('#reset-button').addEventListener('click', () => { world?.reset(); setCamera('orbit'); $('#hotspot').hidden = true; announce('已回到当前场景的起点。'); });
$('#close-hotspot').addEventListener('click', () => { $('#hotspot').hidden = true; });
$('#world-canvas').addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'v' && !event.repeat) { event.preventDefault(); setCamera({ orbit: 'third', third: 'first', first: 'orbit' }[camera]); }
  if (event.key === 'Escape') { $('#hotspot').hidden = true; togglePause(!isPaused); }
});
all('[data-move]').forEach(button => {
  const release = () => { button.classList.remove('pressed'); world?.setMovement(button.dataset.move, false); };
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); button.classList.add('pressed'); world?.setMovement(button.dataset.move, true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(event => button.addEventListener(event, release));
});
window.addEventListener('hashchange', () => {
  const params = new URLSearchParams(location.hash.slice(1)); const id = params.get('world');
  if (params.get('source') === 'lab' && scenes[id]) { setWorld(id, false); setView('lab', false, false); }
  else if (params.get('source') === 'showcase' || id === 'art-garden') setView('showcase', false, false);
  else if (referenceWorlds[id]) { referenceWorld = id; setView('original', false, false); }
});
window.addEventListener('pagehide', event => { if (!event.persisted) { if (guideDialog.open) guideDialog.close(); clearTimeout(originalTimer); world?.destroy(); showcase.destroy(); network.destroy(); } });
function showError(error) {
  if (errorReported) return;
  errorReported = true;
  console.error('Three.js experiment failed:', error);
  const loading = $('#loading'); loading.hidden = false; loading.classList.add('error'); loading.replaceChildren();
  loading.append(Object.assign(document.createElement('strong'), { textContent: '这个设备暂时无法绘制三维场景' }), Object.assign(document.createElement('span'), { textContent: '请启用浏览器的硬件加速，并通过本地 HTTP 服务打开页面。下方的能力说明与原理演示仍可阅读。' }));
  const retry = Object.assign(document.createElement('button'), { type: 'button', className: 'primary', textContent: '重新加载' }); retry.addEventListener('click', () => location.reload()); loading.append(retry);
  announce('三维场景初始化失败，原理说明仍可使用。');
}
async function ensureWorld() {
  if (worldPromise) return worldPromise;
  worldPromise = initializeWorld();
  return worldPromise;
}
async function initializeWorld() {
 try {
  const { createWorld } = await import('./world.js');
  world = createWorld($('#world-canvas'), {
    onReady() { $('#loading').hidden = true; },
    onStats(stats) {
      text('#metric-fps', Math.round(stats.fps));
      text('#metric-draws', stats.drawCalls.toLocaleString('zh-CN'));
      text('#metric-triangles', stats.triangles >= 1000 ? `${(stats.triangles / 1000).toFixed(1)}k` : stats.triangles);
      text('#metric-trees', stats.trees);
    },
    onHotspot(info) { text('#hotspot-title', info.title); text('#hotspot-description', info.description); text('#hotspot-principle', info.principle); $('#hotspot').hidden = false; },
  });
  setWorld(currentWorld, false); setCamera('orbit'); setLight('dawn');
  world.setRoughness(Number($('#roughness').value)); world.setPopulation(Number($('#tree-count').value));
  world.setActive(view === 'lab');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) togglePause(true);
 } catch (error) { showError(error); }
}
const initialParams = new URLSearchParams(location.hash.slice(1));
const initialWorld = initialParams.get('world');
if (referenceWorlds[initialWorld]) referenceWorld = initialWorld;
if (scenes[initialWorld]) currentWorld = initialWorld;
setWorld(currentWorld, false);
setView(initialParams.get('source') === 'lab' ? 'lab' : initialParams.get('source') === 'original' || referenceWorlds[initialWorld] ? 'original' : scenes[initialWorld] ? 'lab' : 'showcase', false, !location.hash || location.hash.includes('world='));
