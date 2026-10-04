// Teaching data created for this page. No Ix backend or indexed repository is queried.
const nodes = [
  { id: 'login', path: 'auth/routes.ts', description: '登录入口', role: 'production' },
  { id: 'refresh_session', path: 'auth/session.ts', description: '刷新会话入口', role: 'production' },
  { id: 'test_token', path: 'tests/token.test.ts', description: '令牌校验测试', role: 'test' },
  { id: 'verify_token', path: 'auth/token.ts', description: '验证令牌', role: 'production' },
  { id: 'load_public_key', path: 'auth/keys.ts', description: '读取公钥', role: 'production' },
  { id: 'load_user', path: 'users/store.ts', description: '读取用户', role: 'production' },
];
const edges = [
  ['login', 'verify_token'], ['refresh_session', 'verify_token'],
  ['test_token', 'verify_token'], ['verify_token', 'load_public_key'], ['login', 'load_user'],
];
const nodeById = new Map(nodes.map(node => [node.id, node]));
const modes = {
  explain: { title: '这个函数是什么？', description: '展示目标实体和直接相邻的调用关系。', note: '结构关系为业务解释提供线索；实际逻辑仍需结合源码。' },
  callers: { title: '谁直接调用它？', description: '沿进入目标的 CALLS 边，找直接调用者。', note: '调用者为空只代表这张示例图没有记录；真实项目也可能存在未识别关系。' },
  callees: { title: '它直接调用谁？', description: '沿从目标出发的 CALLS 边，找直接被调用者。', note: '本例仅展开项目内函数。实际索引是否覆盖外部实现，需具体检查。' },
  trace: { title: '关联调用链有哪些？', description: '合并目标的上游调用入口和下游被调用函数。', note: '本页沿静态调用关系遍历；图中关系不能证明运行时顺序或每条路径都会执行。' },
  impact: { title: '修改它可能影响哪里？', description: '本页示例沿反向调用关系，寻找直接及间接调用者。', note: '这是反向 CALLS 遍历的教学简化，不是上游 impact 算法复现；最终影响需源码与测试验证。' },
};
const targetSelect = document.getElementById('target-select');
let currentMode = 'explain';

function traverse(target, reverse = false) {
  const visited = new Set([target]);
  const foundEdges = new Set();
  const queue = [target];
  while (queue.length) {
    const current = queue.shift();
    for (const [index, [src, dst]] of edges.entries()) {
      if ((reverse ? dst : src) !== current) continue;
      foundEdges.add(index);
      const next = reverse ? src : dst;
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  return { visited, foundEdges };
}

function updateExplorer() {
  const target = targetSelect.value;
  const selectedNode = nodeById.get(target);
  const highlightedNodes = new Set([target]);
  const highlightedEdges = new Set();
  const addEdge = index => { highlightedEdges.add(index); edges[index].forEach(id => highlightedNodes.add(id)); };
  if (currentMode === 'explain') {
    edges.forEach(([src, dst], index) => { if (src === target || dst === target) addEdge(index); });
  } else if (currentMode === 'callers' || currentMode === 'callees') {
    edges.forEach(([src, dst], index) => { if ((currentMode === 'callers' ? dst : src) === target) addEdge(index); });
  } else {
    const upstream = traverse(target, true);
    upstream.foundEdges.forEach(addEdge);
    if (currentMode === 'trace') traverse(target).foundEdges.forEach(addEdge);
  }
  document.querySelectorAll('[data-node]').forEach(element => {
    element.classList.toggle('is-target', element.dataset.node === target);
    element.classList.toggle('is-related', highlightedNodes.has(element.dataset.node));
    element.setAttribute('aria-pressed', String(element.dataset.node === target));
  });
  document.querySelectorAll('.graph-edges path').forEach((element, index) => {
    element.classList.toggle('is-related', highlightedEdges.has(index));
    element.classList.toggle('is-impact', currentMode === 'impact' && highlightedEdges.has(index));
  });
  document.querySelectorAll('.query-option').forEach(button => {
    const active = button.dataset.mode === currentMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.getElementById('result-title').textContent = modes[currentMode].title;
  document.getElementById('result-description').textContent = modes[currentMode].description;
  document.getElementById('query-command').textContent = `ix ${currentMode} ${target}`;
  document.getElementById('query-note').textContent = modes[currentMode].note;
  document.getElementById('copy-status').textContent = '';
  const results = document.getElementById('query-results');
  results.replaceChildren();
  let resultNodes = nodes.filter(node => highlightedNodes.has(node.id) && node.id !== target);
  if (currentMode === 'explain') resultNodes = [selectedNode, ...resultNodes];
  if (!resultNodes.length) {
    const item = document.createElement('li');
    const label = document.createElement('strong'); label.textContent = '示例图中无相关节点';
    const note = document.createElement('span'); note.textContent = '可以切换目标或查询方式';
    item.append(label, note); results.append(item);
  } else {
    resultNodes.forEach(node => {
      const item = document.createElement('li');
      const title = document.createElement('strong'); title.textContent = node.id;
      const detail = document.createElement('span');
      detail.textContent = `${node.path} · ${node.description}${node.role === 'test' ? '（测试）' : ''}`;
      item.append(title, detail); results.append(item);
    });
  }
}

targetSelect.addEventListener('change', updateExplorer);
document.querySelectorAll('.query-option').forEach(button => button.addEventListener('click', () => {
  currentMode = button.dataset.mode; updateExplorer();
}));
document.querySelectorAll('[data-node]').forEach(element => {
  const selectNode = () => { targetSelect.value = element.dataset.node; updateExplorer(); };
  element.addEventListener('click', selectNode);
  element.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(); }
  });
});
document.getElementById('copy-command').addEventListener('click', async () => {
  const command = document.getElementById('query-command').textContent;
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(command);
    status.textContent = '命令已复制；请在安装并映射 Ix 后使用。';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('query-command'));
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    status.textContent = '命令已选中，可按 Ctrl / Cmd + C 复制。';
  }
});
const navigationLinks = [...document.querySelectorAll('.sidebar nav a')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      navigationLinks.forEach(link => {
        const active = link.getAttribute('href') === `#${entry.target.id}`;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-20% 0px -65% 0px', threshold: 0 });
  document.querySelectorAll('main section[id]').forEach(section => observer.observe(section));
}
updateExplorer();

// Each topic is a view of the same editable diagram, not a separate image.
const mapSvg = document.getElementById('understanding-map');
const mapViewport = document.getElementById('map-viewport');
const mapCanvas = document.querySelector('.map-canvas');
const mapScale = document.getElementById('map-scale');
const mapTopics = [...document.querySelectorAll('[data-map-view]')];
let activeMapTopic = mapTopics[0];
function resizeMap() {
  const available = mapViewport.clientWidth;
  const width = mapScale.value === 'fit' ? available
    : mapScale.value === 'read' ? Math.max(1200, available) : 1800 * Number(mapScale.value);
  mapCanvas.style.width = `${width}px`;
}
function showMapTopic(button) {
  activeMapTopic = button;
  const view = button.dataset.viewBox.split(' ').map(Number);
  mapSvg.setAttribute('viewBox', view.join(' '));
  mapSvg.setAttribute('height', String(view[3]));
  mapTopics.forEach(topic => topic.setAttribute('aria-pressed', String(topic === button)));
  document.getElementById('map-current-topic').textContent = button.textContent;
  document.getElementById('map-status').textContent = `当前：${button.textContent}；显示同一张原图的相应范围。`;
  resizeMap();
  mapViewport.scrollTo({top:0, left:0, behavior:'instant'});
}
mapTopics.forEach(button => button.addEventListener('click', () => showMapTopic(button)));
mapScale.addEventListener('change', () => showMapTopic(activeMapTopic));
document.getElementById('map-reset').addEventListener('click', () => {
  mapScale.value = window.innerWidth < 800 ? 'read' : 'fit';
  showMapTopic(mapTopics[0]);
});
window.addEventListener('resize', resizeMap);
if (window.innerWidth < 800) mapScale.value = 'read';
showMapTopic(mapTopics[0]);
