// Client-side dependency checks for a scoped fine-geometry change. Provider
// receipts are evidence of execution; they cannot establish preservation.
import { validatePlan } from './creation-core.js';
import { FINE_ASSET_KINDS, validateFineGeometry, validateFineScope } from './fine-geometry-core.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Scope remains explicit and follows source order. null means the caller
 * intentionally requested a complete regeneration, with no local guarantee. */
export function fineRefinementScope(inputPlan, selectedId, mode = 'kind') {
  const plan = validatePlan(inputPlan);
  if (!['selected', 'kind', 'all'].includes(mode)) throw new Error('精细修改范围模式无效。');
  if (mode === 'all') return null;
  const selected = plan.entities.find(entity => entity.id === selectedId);
  if (!selected || selected.locked || !FINE_ASSET_KINDS.includes(selected.kind)) throw new Error('请选择有效且未锁定的小屋、灯塔、棕榈或船进行精细修改。');
  const ids = mode === 'selected' ? [selected.id] : plan.entities.filter(entity => !entity.locked && entity.kind === selected.kind).map(entity => entity.id);
  return validateFineScope(plan, ids);
}

function dependencyGraph(bundle) {
  const templates = new Map(bundle.templates.map(template => [template.id, template]));
  const materials = new Map(bundle.materials.map(material => [material.id, material]));
  const instances = new Map();
  for (const instance of bundle.instances) {
    const template = templates.get(instance.templateId);
    const materialIds = [...new Set(template.parts.map(part => part.material))].sort();
    instances.set(instance.entityId, { instance, template, materials: materialIds.map(id => materials.get(id)) });
  }
  return instances;
}

/** Validate both complete candidates against the exact source, then compare
 * every dependency actually used outside the scope. A local object may fork a
 * shared template/material; outside IDs and canonical values must stay exact. */
export function assertFineRefinementPreserved(previousInput, currentInput, inputPlan, scopeIds, { baseRecipe } = {}) {
  const plan = validatePlan(inputPlan), scope = validateFineScope(plan, scopeIds), scopeSet = new Set(scope);
  const options = baseRecipe === undefined ? {} : { baseRecipe };
  const previous = validateFineGeometry(previousInput, plan, options), current = validateFineGeometry(currentInput, plan, options);
  const before = dependencyGraph(previous), after = dependencyGraph(current);
  const changedEntityIds = [], unchangedEntityIds = [];
  for (const instance of previous.instances) {
    const oldGraph = before.get(instance.entityId), nextGraph = after.get(instance.entityId);
    if (!scopeSet.has(instance.entityId)) {
      if (!same(oldGraph.instance, nextGraph.instance)) throw new Error(`局部精细修改改变了范围外实例 ${instance.entityId}。`);
      if (!same(oldGraph.template, nextGraph.template)) throw new Error(`局部精细修改改变了范围外模板 ${oldGraph.template.id}（${instance.entityId}）。`);
      if (!same(oldGraph.materials, nextGraph.materials)) throw new Error(`局部精细修改改变了范围外材质（${instance.entityId}）。`);
    }
    (same(oldGraph, nextGraph) ? unchangedEntityIds : changedEntityIds).push(instance.entityId);
  }
  return { sourceFingerprint: current.sourceFingerprint, scopeIds: scope, changedEntityIds, unchangedEntityIds, preservedOutsideScope: true };
}
