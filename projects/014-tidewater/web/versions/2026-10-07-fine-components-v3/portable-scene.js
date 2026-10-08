import { createRealisticScene } from './realistic/scene.js';
import { validatePlan } from './creation-core.js';
import { validateCompletionRecipe } from './scene-completion-core.js';
import { validateFineGeometry } from './fine-geometry-core.js';

const $ = id => document.getElementById(id);
let scene = null, coarse = false;
async function readJSON(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`项目文件无法读取：${path}`);
  return response.json();
}
async function start() {
  const [data, manifest] = await Promise.all([readJSON('./scene.json'), readJSON('./delivery-manifest.json')]);
  const plan = validatePlan(data.sourcePlan), recipe = validateCompletionRecipe(data.recipe, plan);
  const geometry = validateFineGeometry(data.geometry, plan, { baseRecipe: recipe });
  $('title').textContent = geometry.title;
  $('summary').textContent = geometry.summary;
  scene = await createRealisticScene({ canvas: $('scene'), plan, completionRecipe: recipe,
    onProgress: event => { $('status').textContent = typeof event === 'string' ? event : event.detail || event.message || '正在加载本地场景资源…'; } });
  scene.setWorldQuality(true);
  scene.applyFineGeometry(geometry);
  scene.setLighting(recipe.environment.lighting);
  scene.setView('overview');
  if (data.viewState) scene.setViewState(data.viewState);
  const iterations = data.geometryIterations ?? [], diagnostics = data.geometryDiagnostics;
  $('version-info').textContent = `第 ${iterations.length + 1} 版 · 原布局 ${plan.entities.length} 个区域与对象 · 写实品质待验收${diagnostics?.warnings?.length ? ` · 细部诊断有 ${diagnostics.warnings.length} 项提示` : ''}`;
  const reasons = { 'automatic-transform-repair': '此版之后依据几何诊断自动修正', 'visual-refinement': '此版之后依据实际近景继续完善' };
  for (const [index, iteration] of [...iterations, { receipt: data.geometryReceipt, views: data.geometryViews, checks: scene.getFineGeometryChecks(), reason: 'current' }].entries()) {
    const row = document.createElement('li');
    row.textContent = `第 ${index + 1} 版 · ${iteration.reason === 'current' ? '当前场景' : reasons[iteration.reason] ?? '已保留的生成结果'} · ${iteration.views?.length ?? 0} 张输入视图${iteration.checks?.partCount ? ` · ${iteration.checks.partCount} 个部件` : ''}`;
    $('versions').append(row);
  }
  for (const view of data.geometryViews ?? data.inputViews ?? []) {
    const figure = document.createElement('figure'), image = document.createElement('img'), caption = document.createElement('figcaption');
    const url = new URL(view.path, import.meta.url);
    if (url.origin !== location.origin || !url.pathname.startsWith(new URL('./inputs/', import.meta.url).pathname)) throw new Error('项目输入图像路径无效。');
    image.src = url.href; image.alt = view.label; image.loading = 'lazy'; caption.textContent = view.label;
    figure.append(image, caption); $('source-views').append(figure);
  }
  $('status').textContent = `项目就绪 · ${scene.getFineGeometryChecks().entityIds.length} 个精细对象 · 资源来自当前项目目录`;
  $('receipt').textContent = JSON.stringify({ delivery: manifest, reopenedGeometry: scene.getFineGeometryChecks(), diagnostics: data.geometryDiagnostics, visualQuality: 'needs-review', model: data.geometryReceipt, originalModel: data.receipt,
    iterations: iterations.map(({ receipt, views, checks, diagnostics, reason }) => ({ receipt, views, checks, diagnostics, reason })) }, null, 2);
  for (const id of ['overview', 'hero', 'reverse', 'coarse', 'day', 'sunset']) $(id).disabled = false;
}
$('overview').addEventListener('click', () => scene?.setView('overview'));
$('hero').addEventListener('click', () => scene?.setView('hero'));
$('reverse').addEventListener('click', () => scene?.reverseView());
$('day').addEventListener('click', () => scene?.setLighting('day'));
$('sunset').addEventListener('click', () => scene?.setLighting('sunset'));
$('coarse').addEventListener('click', () => { coarse = !coarse; scene?.setMode(coarse ? 'coarse' : 'realistic'); $('coarse').setAttribute('aria-pressed', String(coarse)); $('coarse').textContent = coarse ? '回到精细场景' : '对照粗模'; });
window.addEventListener('pagehide', () => scene?.dispose());
start().catch(error => { $('status').textContent = '场景打开失败。'; $('error').hidden = false; $('error').textContent = error.message; });
