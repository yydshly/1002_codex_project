// Register a scene with [data-scene-capabilities="living|car|imaging"].
// The shared dialog owns its markup; application state and canvas tools stay separate.
const catalogUrl = new URL('./scene-catalog.json', import.meta.url);
const node = (tag, value, className) => {
  const element = document.createElement(tag);
  if (value != null) element.textContent = value;
  if (className) element.className = className;
  return element;
};
let catalogPromise;
const catalog = () => catalogPromise ||= fetch(catalogUrl).then(response => {
  if (!response.ok) throw Error('场景能力说明暂时无法读取');
  return response.json();
}).catch(error => { catalogPromise = null; throw error; });

const dialog = node('dialog', null, 'scene-capabilities-dialog');
dialog.setAttribute('aria-labelledby', 'scene-capabilities-title');
document.body.append(dialog);
dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }
});

function list(title, values, className = '') {
  const block = node('div', null, `sc-verification-block ${className}`), items = node('ul');
  block.append(node('h4', title));
  for (const value of values) items.append(node('li', value));
  block.append(items);
  return block;
}

function heading(name, subtitle) {
  const head = node('div', null, 'sc-heading'), titles = node('div');
  titles.append(node('span', 'SCENE CAPABILITY BRIEF', 'sc-eyebrow'));
  const title = node('h2', name);title.id = 'scene-capabilities-title';
  titles.append(title, node('p', subtitle, 'sc-subtitle'));
  const close = node('button', '×', 'sc-close');
  close.type = 'button';close.setAttribute('aria-label', '关闭场景能力说明');
  close.addEventListener('click', () => dialog.close());head.append(titles, close);
  dialog.append(head);
}

function renderScene(scene, principle) {
  dialog.replaceChildren();
  heading(`${scene.name} · 验证什么`, `${scene.capabilities.length} 项目标能力 · 其他工作流单独作为产品支撑`);
  dialog.append(node('p', scene.purpose, 'sc-purpose'));
  const tags = node('div', null, 'sc-cap-tags');
  for (const capability of scene.capabilities) {
    const link = node('a', `${capability.id} ${capability.name}`);
    link.href = `#sc-capability-${capability.id}`;
    link.addEventListener('click', event => {
      event.preventDefault();
      const target = dialog.querySelector(`#sc-capability-${capability.id}`);
      target.open = true;target.scrollIntoView({ block:'start', behavior:'auto' });
    });
    tags.append(link);
  }
  dialog.append(tags);
  const overview = node('div', null, 'sc-verification-overview');
  overview.append(list('已经做过的验证', scene.validation.completed, 'sc-completed'), list('待专项验收', scene.validation.pending, 'sc-pending'));
  dialog.append(overview);
  const inventory = node('div', null, 'sc-capability-items');
  for (const capability of scene.capabilities) {
    const detail = node('details', null, 'sc-capability');detail.id = `sc-capability-${capability.id}`;
    if (scene.capabilities.length <= 3) detail.open = true;
    const summary = node('summary');summary.append(node('span', capability.id, 'sc-cap-id'), node('strong', capability.name), node('span', '操作与验证', 'sc-summary-label'));
    const definition = node('dl');
    for (const [label, value] of [['鼠标 / 操作', capability.operation],['预期现象', capability.expected],['如何验证', capability.verification],['实现边界', capability.boundary]]) definition.append(node('dt', label), node('dd', value));
    const checks = node('div', null, 'sc-cap-checks');
    checks.append(list('已做验证', capability.completed, 'sc-completed'), list('待专项验收', capability.pending, 'sc-pending'));
    detail.append(summary, definition, checks);inventory.append(detail);
  }
  dialog.append(inventory);
  const supporting = node('div', null, 'sc-supporting');supporting.append(node('h3', '产品支撑能力 · 不重复计数'));
  for (const item of scene.supporting) { const row = node('p');row.append(node('strong', item.name), node('span', item.scope));supporting.append(row); }
  const boundary = node('div', null, 'sc-boundary');boundary.append(node('h3', '整个场景的实现边界'));
  const limits = node('ul');for (const value of scene.boundaries) limits.append(node('li', value));boundary.append(limits);
  dialog.append(supporting, boundary, node('p', principle, 'sc-principle'));
  const footer = node('div', null, 'sc-footer');
  const integration = node('a', '查看全部能力与接入规划 ↗');integration.href = './integration.html#scenes';
  footer.append(integration);
  for (const entry of scene.additionalEntries ?? []) { const link = node('a', `${entry.name} ↗`);link.href = entry.entry;footer.append(link); }
  footer.append(node('span', `验证记录：${scene.validation.record}`));dialog.append(footer);
}

export async function openSceneCapabilities(sceneId) {
  dialog.replaceChildren();heading('本场景验证什么', '正在读取场景能力说明…');
  if (!dialog.open) dialog.showModal();
  try {
    const data = await catalog(), scene = data.scenes.find(item => item.id === sceneId);
    if (!scene) throw Error('没有找到对应场景的能力说明');
    renderScene(scene, data.principle);
    dialog.scrollTop = 0;dialog.querySelector('.sc-close').focus({preventScroll:true});
  } catch (error) {
    dialog.replaceChildren();heading('场景说明暂时无法打开', '可关闭后重试，或在接入说明页面查看。');
    dialog.append(node('p', error.message, 'sc-purpose'));
  }
}

document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-scene-capabilities]');
  if (trigger) { event.preventDefault();void openSceneCapabilities(trigger.dataset.sceneCapabilities); }
});
