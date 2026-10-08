import { createPlan, validatePlan, applyPlanOperations } from '../creation-core.js';
import { WATER_SURFACE_OFFSET } from '../creation-surfaces.js';

const frame = document.getElementById('preview'), results = document.getElementById('results');
let checks = [], running = false;
const rect = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
const entity = (id, kind, points, height = kind === 'land' ? 3 : 0) => ({ id, kind, points, height, locked: false });
const fixture = entities => validatePlan({ ...createPlan(), name: '陆地上的湖面', entities });
const check = (name, pass) => {
  checks.push({ name, pass: !!pass });
  const item = document.createElement('li'); item.textContent = `${pass ? '✓' : '✗'} ${name}`; item.classList.toggle('fail', !pass); results.append(item);
  if (!pass) throw new Error(name);
};
const near = (a, b) => Math.abs(a - b) < .001;
async function apply(plan) {
  const preview = frame.contentWindow.creationPreview, generation = preview.stats.generation;
  frame.contentWindow.postMessage({ source: 'tidewater-creation', type: 'plan', plan }, location.origin);
  const start = performance.now();
  while (preview.stats.generation <= generation || preview.stats.inFlight || !preview.stats.rendered) {
    if (performance.now() - start > 20000) throw new Error('预览未完成更新');
    await new Promise(requestAnimationFrame);
  }
  // applyPlan schedules a frame; wait for the new plan to have actually rendered.
  await new Promise(requestAnimationFrame);
  while (preview.stats.inFlight) await new Promise(requestAnimationFrame);
  return preview;
}
async function run() {
  if (running) return; running = true; checks = []; results.replaceChildren();
  document.getElementById('run').disabled = true; document.getElementById('status').textContent = '正在检查真实几何…';
  try {
    const land = entity('land', 'land', rect(.12, .18, .88, .82));
    const water = entity('lake', 'water', rect(.36, .35, .64, .65));
    let plan = fixture([land, water]), preview = await apply(plan);
    check('默认水面位于 3 米陆地顶面之上', near(preview.getEntityBounds('lake').min[1], 3 + WATER_SURFACE_OFFSET));
    check('水面仍是可独立选择的真实三角形', preview.getEntityBounds('lake').triangles === 2 && preview.stats.bufferBytes > 0);
    preview = await apply(fixture([water, land]));
    check('先画水面再画陆地，水位相同', near(preview.getEntityBounds('lake').min[1], 3 + WATER_SURFACE_OFFSET));
    plan = applyPlanOperations(plan, [{ type: 'update', id: 'land', values: { height: 8 } }]);
    preview = await apply(plan);
    check('抬高陆地后水面自动跟随', near(preview.getEntityBounds('lake').min[1], 8 + WATER_SURFACE_OFFSET));
    plan = applyPlanOperations(plan, [{ type: 'update', id: 'lake', values: { points: rect(.90, .35, .98, .65) } }]);
    preview = await apply(plan);
    check('水域移出陆地后回到原最低水位', near(preview.getEntityBounds('lake').min[1], WATER_SURFACE_OFFSET));
    preview = await apply(fixture([land, { ...water, height: 10 }]));
    check('显式最低水位高于陆地时仍有效', near(preview.getEntityBounds('lake').min[1], 10 + WATER_SURFACE_OFFSET));
    const lockedWater = { ...water, locked: true };
    plan = fixture([{ ...land, height: 6 }, lockedWater]); const before = JSON.stringify(plan);
    preview = await apply(plan);
    check('锁定水域依然可见且预览不改草案字段', near(preview.getEntityBounds('lake').min[1], 6 + WATER_SURFACE_OFFSET) && JSON.stringify(plan) === before && preview.plan.entities[1].height === 0);
    const boat = entity('boat', 'boat', [{ x: .5, y: .5 }], 2);
    preview = await apply(fixture([land, { ...water, height: 10 }, boat]));
    check('船只放置在抬高的真实水面上', preview.getEntityBounds('boat').min[1] >= 10 + WATER_SURFACE_OFFSET);
    preview = await apply(fixture([entity('vertical', 'land', rect(.45, .1, .55, .9), 7), entity('horizontal', 'water', rect(.1, .45, .9, .55))]));
    check('仅边交叉的水陆也能识别叠加', near(preview.getEntityBounds('horizontal').min[1], 7 + WATER_SURFACE_OFFSET));
    preview = await apply(fixture([entity('small-island', 'land', rect(.4, .4, .6, .6), 5), entity('large-water', 'water', rect(.2, .2, .8, .8))]));
    check('水域完全包含陆地也能识别', near(preview.getEntityBounds('large-water').min[1], 5 + WATER_SURFACE_OFFSET));
    preview = await apply(fixture([land, water, entity('higher-land', 'land', rect(.5, .4, .8, .8), 9)]));
    check('不同高度陆地叠加取最高接触面', near(preview.getEntityBounds('lake').min[1], 9 + WATER_SURFACE_OFFSET));
    const finalPlan = fixture([land, { ...water, id: 'earlier-lake' }, water, entity('second-lake', 'water', rect(.19, .29, .28, .48)), entity('cabin', 'cabin', [{ x: .73, y: .66 }], 7), entity('boat', 'boat', [{ x: .46, y: .52 }], 2)]);
    preview = await apply(finalPlan); preview.camera('top');
    check('真实 WebGPU 预览完成更新', preview.ready && preview.stats.entities === 6 && preview.stats.rendered > 0);
    document.getElementById('status').textContent = `${checks.length}/${checks.length} 通过 · 等待点击中央湖面验证拾取`;
  } catch (error) { document.getElementById('status').textContent = `检查失败：${error.message}`; }
  finally { running = false; document.getElementById('run').disabled = false; }
}
document.getElementById('run').addEventListener('click', run);
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'tidewater-creation-preview') return;
  if (event.data.type === 'ready') { document.getElementById('run').disabled = false; document.getElementById('status').textContent = 'WebGPU 已就绪'; }
  if (event.data.type === 'error') document.getElementById('status').textContent = event.data.message;
  if (event.data.type === 'select') {
    document.getElementById('selection').textContent = `已选中：${event.data.id || '无'}（真实三角形拾取）`;
    if (!running && event.data.id === 'lake' && !checks.some(item => item.name === '真实点击拾取湖面，重叠时选择后创建的水域')) {
      check('真实点击拾取湖面，重叠时选择后创建的水域', true);
      document.getElementById('status').textContent = `${checks.length}/${checks.length} 通过 · 已验证湖面拾取`;
    }
  }
});
