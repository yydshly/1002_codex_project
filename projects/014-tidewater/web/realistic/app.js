import { validatePlan, summarizePlan } from '../creation-core.js';
import { fingerprintPlan } from '../model-scene-core.js';

const $ = id => document.getElementById(id);
const buildButton = $('realistic-build');
let scene = null, sourceFingerprint = '', busy = false, mode = 'realistic', lighting = 'day';
let revision = -1, downloadURL = null, generation = 0;
const viewNames = { hero: '海岸视角', cabin: '小屋近景', lighthouse: '灯塔近景', palms:'棕榈近景', boats:'船只近景', overview: '完整布局' };
const controls = [...document.querySelectorAll('[data-realistic-view], [data-realistic-light]'), $('realistic-reverse-view'), $('realistic-mode'), $('realistic-capture'), $('realistic-export-snapshot')].filter(Boolean);

function status(message, error = false) {
  $('realistic-status').textContent = message;
  $('realistic-status').classList.toggle('error', error);
}
function setControls(enabled) { controls.forEach(control => { control.disabled = !enabled; }); }
function currentPlan() {
  if (!window.creationStudio?.ready) throw new Error('布局正在恢复，请稍后再试。');
  return validatePlan(window.creationStudio.plan);
}
function showSource() {
  if (!window.creationStudio?.ready) { buildButton.disabled = true; return; }
  if (revision === window.creationStudio.revision) return;
  revision = window.creationStudio.revision;
  const plan = currentPlan(), summary = summarizePlan(plan);
  $('realistic-source').textContent = `当前「${plan.name}」 · ${plan.world.width} × ${plan.world.depth} 米 · ${summary.entityCount} 个区域 / 对象`;
  buildButton.disabled = busy || !plan.entities.length;
  if (scene && sourceFingerprint !== fingerprintPlan(plan)) {
    status('布局已修改。预览仍显示上次快照，点击更新后采用当前布局。');
    buildButton.textContent = '按当前布局更新材质预览';
  }
}
function renderStats() {
  const stats = scene?.getStats() || {};
  const warnings = Array.isArray(stats.warnings) ? stats.warnings : [];
  const assets = mode === 'realistic' ? ` · ${stats.scannedRocks || 0} 处扫描岩石 · ${stats.scannedGrassClumps || 0} 处草簇` : '';
  const generated = mode === 'realistic' && stats.generatedAssets ? ` · ${stats.visibleGeneratedAssets ?? stats.generatedAssets} 个可见模型资产 / ${stats.generatedAssets} 个已载入` : '';
  $('realistic-stats').textContent = `${mode === 'realistic' ? stats.worldQuality ? '整场景候选' : '写实材质实验' : '粗模对照'} · ${stats.renderer || 'WebGL 2'}${generated}${assets}${stats.worldQuality ? ' · 实拍 HDR 天空 / 分区水面' : ''}${warnings.length ? ` · ${warnings.join('；')}` : ''}`;
}
function pressed(selector, attribute, value) {
  document.querySelectorAll(selector).forEach(button => button.setAttribute('aria-pressed', String(button.dataset[attribute] === value)));
}
async function build() {
  if (busy) return;
  let plan;
  try { plan = currentPlan(); } catch (error) { status(error.message, true); return; }
  if (!plan.entities.length) { status('先画出陆地或放置对象，再转换为写实场景。'); return; }
  busy = true; buildButton.disabled = true; setControls(false);
  const ticket = ++generation;
  status('读取当前粗模，准备物理材质与扫描素材…');
  $('realistic-empty')?.setAttribute('hidden', '');
  try {
    // Reading this snapshot never writes to the creator's draft or its undo history.
    const { createRealisticScene } = await import('./scene.js');
    scene?.dispose(); scene = null;
    mode = 'realistic'; lighting = plan.style.lighting;
    const candidate = await createRealisticScene({
      canvas: $('realistic-canvas'), plan, mode,
      onProgress: message => { if (ticket === generation) status(typeof message === 'string' ? message : message?.detail || message?.message || '准备场景…'); },
    });
    if (ticket !== generation) { candidate.dispose(); return; }
    scene = candidate;
    await scene.setLighting(lighting);
    scene.setView('hero');
    sourceFingerprint = fingerprintPlan(plan);
    $('realistic-canvas').dataset.sourceFingerprint = sourceFingerprint;
    $('realistic-canvas').dataset.entityCount = String(plan.entities.length);
    $('realistic-mode').textContent = '查看粗模';
    $('realistic-mode').setAttribute('aria-pressed', 'false');
    pressed('[data-realistic-view]', 'realisticView', 'hero');
    pressed('[data-realistic-light]', 'realisticLight', lighting);
    renderStats(); setControls(true);
    status('已按当前布局构建 3D 写实材质场景。拖动旋转，滚轮缩放；可切换粗模对照。');
    buildButton.textContent = '按当前布局更新材质预览';
    window.dispatchEvent(new CustomEvent('realistic-scene-ready', { detail: { sourceFingerprint } }));
  } catch (error) {
    scene?.dispose(); scene = null;
    $('realistic-empty')?.removeAttribute('hidden');
    status(`场景没有完成：${error.message || error}。可重试，原布局仍保留。`, true);
  } finally {
    busy = false; revision = -1; showSource();
  }
}
buildButton.addEventListener('click', build);
$('realistic-mode').addEventListener('click', () => {
  if (!scene || busy) return;
  mode = mode === 'realistic' ? 'coarse' : 'realistic';
  scene.setMode(mode);
  $('realistic-mode').textContent = mode === 'realistic' ? '查看粗模' : '返回写实效果';
  $('realistic-mode').setAttribute('aria-pressed', String(mode === 'coarse'));
  renderStats();
  window.dispatchEvent(new CustomEvent('realistic-mode-changed', { detail: { mode } }));
});
// The asset workbench shares this renderer and its read-only source snapshot.
export function getRealisticScene() { return scene; }
export async function ensureRealisticScene() {
  if (scene && sourceFingerprint === fingerprintPlan(currentPlan())) return scene;
  if (busy) throw new Error('场景正在构建，请稍后再试。');
  if (!scene || sourceFingerprint !== fingerprintPlan(currentPlan())) await build();
  if (!scene) throw new Error('写实场景未能完成，请检查上方提示。');
  return scene;
}
export function showRealisticAssetView(view = 'cabin') {
  if (!scene) return;
  scene.setView(view); pressed('[data-realistic-view]', 'realisticView', view);
}
export function setRealisticAssetMode(nextMode) {
  if (!scene || !['coarse', 'realistic'].includes(nextMode)) return;
  mode = nextMode; scene.setMode(mode);
  $('realistic-mode').textContent = mode === 'realistic' ? '查看粗模' : '返回写实效果';
  $('realistic-mode').setAttribute('aria-pressed', String(mode === 'coarse')); renderStats();
  window.dispatchEvent(new CustomEvent('realistic-mode-changed', { detail: { mode } }));
}
window.addEventListener('world-session-active', () => { if(scene) renderStats(); });
$('realistic-reverse-view')?.addEventListener('click', () => {
  if (!scene || busy) return;
  scene.reverseView();
  status('已转到当前对象的另一侧。检查模型推测的背面形态；再次点击可返回。');
});
document.querySelectorAll('[data-realistic-view]').forEach(button => button.addEventListener('click', () => {
  if (!scene) return;
  scene.setView(button.dataset.realisticView);
  pressed('[data-realistic-view]', 'realisticView', button.dataset.realisticView);
  status(`当前：${viewNames[button.dataset.realisticView]}。拖动可继续观察同一 3D 场景。`);
}));
document.querySelectorAll('[data-realistic-light]').forEach(button => button.addEventListener('click', async () => {
  if (!scene || busy) return;
  busy = true; setControls(false); buildButton.disabled = true;
  try {
    await scene.setLighting(button.dataset.realisticLight);
    lighting = button.dataset.realisticLight;
    pressed('[data-realistic-light]', 'realisticLight', lighting);
    status(`已切换为${lighting === 'sunset' ? '日落' : '日间'}光照。`); renderStats();
  } catch (error) { status(`光照加载失败：${error.message}`, true); }
  finally { busy = false; setControls(true); revision = -1; showSource(); }
}));
$('realistic-capture').addEventListener('click', async () => {
  if (!scene) return;
  try {
    const captured = await scene.capture();
    if (downloadURL?.startsWith('blob:')) URL.revokeObjectURL(downloadURL);
    downloadURL = captured instanceof Blob ? URL.createObjectURL(captured) : captured;
    const link = $('realistic-download');
    if (link) {
      link.href = downloadURL; link.download = 'tidewater-realistic-view.png'; link.hidden = false;
      link.textContent = '当前视角截图已准备好 ↓'; link.click();
    } else {
      const link = document.createElement('a'); link.href = downloadURL;
      link.download = 'tidewater-realistic-view.png'; link.click();
    }
    status('已准备当前镜头截图。截图是场景渲染记录，旋转和缩放仍作用于真实 3D。');
  } catch (error) { status(`截图没有完成：${error.message}`, true); }
});
setControls(false); showSource();
$('realistic-export-snapshot').addEventListener('click', () => {
  if (!scene) return;
  const frozenPlan = structuredClone(scene.sourcePlan);
  const stats = scene.getStats();
  const assetOverrides = scene.getAssetOverrides?.().map(({ url, ...record }) => record) || [];
  const snapshot = {
    format: 'tidewater-effect-snapshot.v1', savedAt: new Date().toISOString(),
    sourceFingerprint: fingerprintPlan(frozenPlan), plan: frozenPlan,
    renderer: { id: stats.worldQuality ? 'whole-scene-candidate-v1' : assetOverrides.length ? 'realistic-with-neural-assets-v1' : 'realistic-material-v1', engine: stats.renderer, mode, lighting, worldQuality: Boolean(stats.worldQuality), environment: stats.worldEnvironment,
      view: stats.view, camera: scene.getViewState(), performance: { triangles:stats.triangles, drawCalls:stats.drawCalls, fps:stats.fps }, visibleGeneratedAssets:stats.visibleGeneratedAssets },
    assetOverrides,
    provenance: stats.worldQuality ? '包含真实神经模型资产、实拍扫描资源与布局程序几何；逐项来源和可见状态在第 07 步导出。已载入不代表视觉质量通过。' : assetOverrides.length ? '包含实际神经模型生成资产；具体任务来源与 GLB 在第 06 步独立导出。' : '编码模型实现的本地资源组装；未调用在线 3D 生成模型。',
    portability: '本文件保存布局、镜头与资产适配记录；GLB 二进制需另行下载，不是完整场景工程包。',
  };
  const link = $('realistic-snapshot-download');
  link.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(snapshot, null, 2))}`;
  link.download = 'tidewater-scene.effect.json'; link.hidden = false;
  link.textContent = '效果方案已准备好 ↓'; link.click();
  status('已准备当前预览的布局、镜头和光照方案。原绘笔草案保留。');
});
const sourceWatcher = setInterval(showSource, 750);
window.addEventListener('pagehide', () => {
  generation++; clearInterval(sourceWatcher); scene?.dispose();
  if (downloadURL?.startsWith('blob:')) URL.revokeObjectURL(downloadURL);
}, { once: true });
