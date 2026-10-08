import { createPlan, createDemoPlan, validatePlan, applyPlanOperations } from '../creation-core.js';
import { makeRefinement, generateLandDetails } from '../creation-refinement.js';

const frame = document.getElementById('preview'), list = document.getElementById('results');
let checks = [], running = false, finalBefore, finalAfter;
const clone = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, pass) => {
  checks.push({ name, pass: !!pass }); const item = document.createElement('li'); item.textContent = `${pass ? '✓' : '✗'} ${name}`; item.classList.toggle('fail', !pass); list.append(item);
  if (!pass) throw new Error(name);
};
async function apply(plan) {
  const preview = frame.contentWindow.creationPreview, generation = preview.stats.generation, rendered = preview.stats.rendered;
  frame.contentWindow.postMessage({ source: 'tidewater-creation', type: 'plan', plan }, location.origin);
  const start = performance.now();
  while (preview.stats.generation <= generation || preview.stats.rendered <= rendered || preview.stats.inFlight) {
    if (performance.now() - start > 20000) throw new Error('真实几何未完成更新');
    await new Promise(requestAnimationFrame);
  }
  return preview;
}
async function run() {
  if (running) return; running = true; checks = []; list.replaceChildren(); document.getElementById('run').disabled = true;
  document.getElementById('status').textContent = '正在检查真实几何…';
  try {
    const base = createDemoPlan();
    base.entities.push({ id: 'lake', kind: 'water', points: [{ x: .29, y: .60 }, { x: .35, y: .58 }, { x: .36, y: .67 }, { x: .28, y: .69 }], height: 0, locked: false });
    const original = clone(base), target = 'island-west';
    let preview = await apply(base), before = preview.getEntityBounds(target), initialTriangles = preview.stats.triangles;
    const others = base.entities.filter(entity => entity.id !== target).map(entity => [entity.id, preview.getEntityBounds(entity.id)]);
    const tropical = applyPlanOperations(base, [{ type: 'update', id: target, values: { refinement: makeRefinement('tropical', 2, 17) } }]);
    preview = await apply(tropical); const refined = preview.getEntityBounds(target), expected = generateLandDetails(tropical, tropical.entities[0]);
    check('真实渲染增加岩石和植被三角形', refined.decorations > 0 && preview.stats.triangles > initialTriangles + 100);
    check('沙滩岸带是新增的真实几何', refined.beachTriangles > 0 && refined.beachTriangles <= 768);
    check('陆地原轮廓与原标高几何完全保留', same(refined.baseBounds, before.baseBounds) && refined.baseTriangles === before.baseTriangles);
    check('水面、道路与其他已有对象几何不变', others.every(([id, bounds]) => same(preview.getEntityBounds(id), bounds)));
    check('纯规则输出与实际渲染细节一致', same(preview.getRefinementDetails(target), expected.decorations));
    check('候选生成没有改动输入草案', same(base, original));
    const firstDetails = preview.getRefinementDetails(target), locked = applyPlanOperations(tropical, [{ type: 'update', id: target, values: { locked: true } }]);
    const both = applyPlanOperations(locked, [{ type: 'update', id: 'island-east', values: { refinement: makeRefinement('rocky', 3, 49) } }]);
    preview = await apply(both);
    check('细化另一个区域不改变已锁定岛的细节', same(preview.getRefinementDetails(target), firstDetails));
    const rerolled = applyPlanOperations(tropical, [{ type: 'update', id: target, values: { refinement: makeRefinement('tropical', 2, 18) } }]);
    preview = await apply(rerolled);
    check('换一版改变派生外观但保留布局', !same(preview.getRefinementDetails(target), firstDetails) && same(preview.getEntityBounds(target).baseBounds, before.baseBounds));
    const garden = applyPlanOperations(tropical, [{ type: 'update', id: target, values: { refinement: makeRefinement('garden', 2, 17) } }]);
    preview = await apply(garden);
    check('切换花园方向生成树林与灌木', preview.getRefinementDetails(target).some(detail => detail.type === 'tree') && !preview.getRefinementDetails(target).some(detail => detail.type === 'palm'));
    const restored = applyPlanOperations(garden, [{ type: 'update', id: target, values: { refinement: null } }]);
    preview = await apply(restored);
    check('移除细化恢复原粗模三角形与布局', preview.stats.triangles === initialTriangles && same(preview.plan, base));
    preview = await apply(validatePlan(JSON.parse(JSON.stringify(tropical))));
    check('完整 JSON 恢复相同的派生 3D 外观', same(preview.getRefinementDetails(target), firstDetails));
    const limits = createPlan(); limits.entities = Array.from({ length: 5 }, (_, i) => {
      const x = .04 + (i % 3) * .32, y = .04 + Math.floor(i / 3) * .5;
      return { id: `budget-${i}`, kind: 'land', points: [{ x, y }, { x: x + .25, y }, { x: x + .25, y: y + .4 }, { x, y: y + .4 }], height: 3, locked: false, refinement: makeRefinement('tropical', 3, i + 10) };
    });
    preview = await apply(limits);
    check('五块丰富陆地保持装饰和沙滩总预算', preview.stats.decorations <= 240 && preview.stats.beachTriangles <= 3840 && preview.stats.decorations > 100);
    finalBefore = base; finalAfter = both; preview = await apply(finalAfter); preview.camera('overview');
    document.getElementById('before').disabled = false; document.getElementById('after').disabled = false;
    document.getElementById('status').textContent = `${checks.length}/${checks.length} 通过 · 可比较或点击装饰`;
    await new Promise(requestAnimationFrame);
    const rock = preview.getRefinementDetails(target).find(detail => detail.type === 'rock');
    if (rock) {
      const p = preview.projectPoint(rock.point, 3 + rock.scale), rect = frame.getBoundingClientRect();
      const guide = document.getElementById('pick-guide');
      guide.textContent = `装饰拾取位置：页面 x=${Math.round(rect.left + p.x)}, y=${Math.round(rect.top + p.y)}；点击后应选中 island-west。`;
    }
  } catch (error) { document.getElementById('status').textContent = `检查失败：${error.message}`; }
  finally { running = false; document.getElementById('run').disabled = false; }
}
document.getElementById('run').addEventListener('click', run);
document.getElementById('before').addEventListener('click', () => apply(finalBefore));
document.getElementById('after').addEventListener('click', () => apply(finalAfter));
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'tidewater-creation-preview') return;
  if (event.data.type === 'ready') { document.getElementById('run').disabled = false; document.getElementById('status').textContent = 'WebGPU 已就绪'; }
  if (event.data.type === 'error') document.getElementById('status').textContent = event.data.message;
  if (event.data.type === 'select') {
    document.getElementById('selection').textContent = `真实拾取：${event.data.id || '无'}`;
    if (!running && event.data.id === 'island-west' && !checks.some(item => item.name === '真实点击装饰仍选中所属陆地')) {
      check('真实点击装饰仍选中所属陆地', true);
      document.getElementById('status').textContent = `${checks.length}/${checks.length} 通过 · 已验证实际拾取`;
    }
  }
});
