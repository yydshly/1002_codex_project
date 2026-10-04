// All interactive examples are teaching illustrations, not model inference.
const modes = {
  clone: {
    label: 'ZERO-SHOT VOICE CLONING', title: '让新文稿，用参考声音来说',
    description: '输入短参考音频，模型利用其中的声音特征合成另一段文字。正常使用不需要为这个人重新训练模型。',
    required: '目标文字 text + 参考音频 ref_audio',
    optional: '参考转写 ref_text；省略时调用 Whisper 转写',
    note: '参考音频建议 3–10 秒。可跨语言克隆，但参考语言可能影响口音。',
    code: 'audio = model.generate(\n    text="你好，欢迎来到今天的课程。",\n    ref_audio="ref.wav",\n    ref_text="这是参考录音里说的内容。",\n)',
  },
  design: {
    label: 'VOICE DESIGN', title: '用声音属性，探索想要的声音',
    description: '通过性别、年龄、音高、耳语、口音或方言等支持的属性生成声音。不需要参考音频；属性作为模型条件。',
    required: '目标文字 text + 声音属性 instruct',
    optional: '语言 language、语速 speed、步数 num_step 等',
    note: '属性按类别组合，每类选择一种。设计主要在中英文数据上训练，部分组合或低资源语言可能不稳定。',
    code: 'audio = model.generate(\n    text="Welcome to today’s lesson.",\n    instruct="female, low pitch, british accent",\n)',
  },
  auto: {
    label: 'AUTO VOICE', title: '只提供文字，让模型选择声音',
    description: '不提供参考音频或声音属性，直接生成目标文稿的语音。适合快速试用和不指定固定声音的任务。',
    required: '目标文字 text',
    optional: '语言 language、语速 speed、步数 num_step 等',
    note: '没有明确的声音条件，模型自动选择声音。长文内部可复用首段声音，以帮助后续分段保持一致。',
    code: 'audio = model.generate(\n    text="你好，欢迎来到今天的课程。",\n)',
  },
};
const modeTabs = [...document.querySelectorAll('[data-mode]')];
function selectMode(mode, focus = false) {
  const content = modes[mode];
  if (!content) return;
  for (const tab of modeTabs) {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  for (const field of ['label', 'title', 'description', 'required', 'optional', 'note', 'code']) {
    document.getElementById(`mode-${field}`).textContent = content[field];
  }
  document.getElementById('mode-panel').setAttribute('aria-labelledby', `tab-${mode}`);
}
modeTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectMode(tab.dataset.mode));
  tab.addEventListener('keydown', event => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? modeTabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + modeTabs.length) % modeTabs.length;
    selectMode(modeTabs[next].dataset.mode, true);
  });
});

const attentionValues = [37, null, 215, null, null, 82, null, 601];
let attentionMode = 'bidirectional';
let attentionTarget = 3;
const attentionContainer = document.getElementById('attention-sequence');
function renderAttention(focus = false) {
  const elements = attentionValues.map((value, index) => {
    const cell = document.createElement('div');
    cell.className = 'attention-cell';
    const known = value !== null;
    const visible = known && (attentionMode === 'bidirectional' || index < attentionTarget);
    cell.classList.toggle('available', visible);
    cell.classList.toggle('hidden-known', known && !visible);
    cell.classList.toggle('is-selected', index === attentionTarget);
    const box = document.createElement(known ? 'div' : 'button');
    box.className = 'cell-box';
    box.textContent = known ? String(value) : 'MASK';
    if (known) {
      box.setAttribute('aria-label', `位置 ${index + 1}，已填编码 ${value}，${visible ? '可以参考' : '当前对照范围不可参考'}`);
    } else {
      box.type = 'button';
      box.setAttribute('aria-label', `预测位置 ${index + 1} 的 MASK`);
      box.setAttribute('aria-pressed', String(index === attentionTarget));
      box.addEventListener('click', () => { attentionTarget = index; renderAttention(true); });
    }
    const label = document.createElement('span');
    label.textContent = `位置 ${index + 1}`;
    cell.append(box, label);
    return cell;
  });
  attentionContainer.replaceChildren(...elements);
  const available = attentionValues.flatMap((value, index) => value !== null && (attentionMode === 'bidirectional' || index < attentionTarget) ? [index + 1] : []);
  const explanation = document.getElementById('attention-explanation');
  const lead = document.createElement('strong');
  lead.textContent = `预测位置 ${attentionTarget + 1}：`;
  explanation.replaceChildren(lead, document.createTextNode(`可参考位置 ${available.join('、')} 的已填编码，以及已知条件。${attentionMode === 'bidirectional' ? '左右两边的已填信息都能参与；其他 MASK 仍是未知。' : '单向因果对照只参考左边；右侧即使已经填好，也不在这个可见范围内。'}`));
  document.querySelectorAll('[data-attention]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.attention === attentionMode)));
  if (focus) attentionContainer.querySelector('button[aria-pressed="true"]').focus();
}
document.querySelectorAll('[data-attention]').forEach(button => button.addEventListener('click', () => {
  attentionMode = button.dataset.attention;
  renderAttention();
}));
renderAttention();

const rows = 8;
const frames = 12;
// Synthetic fill order: lower codebooks are favoured, while positions can be filled anywhere.
const fillOrder = Array.from({ length: rows * frames }, (_, index) => ({
  index, score: Math.floor(index / frames) * 0.085 + ((index * 37 + 11) % 97) / 97,
})).sort((a, b) => a.score - b.score);
const rank = new Map(fillOrder.map((item, index) => [item.index, index]));
const fillCounts = [0, 18, 43, 72, 96];
const roundDescriptions = [
  '目标区域全部是 MASK。文字和声音条件已经准备好，但目标声音编码仍然未知。',
  '模型并行预测空位，优先填入一批排序靠前的编码。示意中较低层码本获得一定优先，位置可以分布在整段音频里。',
  '结合条件与第一轮已填信息，继续预测并填入。后面的已填编码也可以帮助前面尚未填好的位置。',
  '可用的上下文越来越丰富，继续补齐剩余空位。当前推理实现保留此前已填编码，再加入本轮的新编码。',
  '所有编码已填好，可以交给音频解码器得到波形。教学演示到此结束；这里不会产生真实声音。',
];
let round = 0;
function renderMatrix() {
  const count = fillCounts[round];
  const previous = round === 0 ? 0 : fillCounts[round - 1];
  const cells = [];
  const corner = document.createElement('div');
  corner.className = 'matrix-label';
  corner.textContent = '时间 →';
  cells.push(corner);
  for (let frame = 0; frame < frames; frame++) {
    const axis = document.createElement('div');
    axis.className = 'matrix-label axis';
    axis.textContent = `t${frame + 1}`;
    cells.push(axis);
  }
  for (let row = 0; row < rows; row++) {
    const label = document.createElement('div');
    label.className = 'matrix-label';
    label.textContent = `码本 ${row + 1}`;
    cells.push(label);
    for (let frame = 0; frame < frames; frame++) {
      const index = row * frames + frame;
      const order = rank.get(index);
      const filled = order < count;
      const cell = document.createElement('div');
      cell.className = 'mask-cell';
      cell.classList.toggle('filled', filled);
      cell.classList.toggle('newly-filled', filled && order >= previous);
      cell.textContent = filled ? String((index * 73 + 37) % 1024) : '·';
      cell.title = `码本 ${row + 1}，时间 t${frame + 1}：${filled ? `示意编号 ${cell.textContent}${order >= previous ? '（本轮填入）' : ''}` : 'MASK 未知'}`;
      cell.setAttribute('aria-label', cell.title);
      cells.push(cell);
    }
  }
  document.getElementById('mask-matrix').replaceChildren(...cells);
  document.getElementById('mask-counter').textContent = `${count} / 96 个编码已填`;
  document.getElementById('mask-progress-fill').style.width = `${count / 96 * 100}%`;
  const explanation = document.getElementById('mask-explanation');
  const lead = document.createElement('strong');
  lead.textContent = `${round === 0 ? '初始化' : round === 4 ? '补全完成' : `第 ${round} 轮`}：`;
  explanation.replaceChildren(lead, document.createTextNode(roundDescriptions[round]));
  document.getElementById('mask-next').disabled = round === 4;
  document.getElementById('mask-next').textContent = round === 4 ? '已完成 ✓' : '下一轮 →';
  document.getElementById('mask-reset').disabled = round === 0;
  document.querySelectorAll('[data-round]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.round) === round)));
}
document.querySelectorAll('[data-round]').forEach(button => button.addEventListener('click', () => {
  round = Number(button.dataset.round);
  renderMatrix();
}));
document.getElementById('mask-next').addEventListener('click', () => { if (round < 4) { round++; renderMatrix(); } });
document.getElementById('mask-reset').addEventListener('click', () => { round = 0; renderMatrix(); });
renderMatrix();

let toastTimer;
function showToast(message) {
  const toast = document.getElementById('toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
async function copyText(content) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(content); return true; } catch { /* Fall back for direct file previews. */ }
  }
  const active = document.activeElement;
  const area = document.createElement('textarea');
  area.value = content;
  area.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.append(area);
  area.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  area.remove();
  active?.focus();
  return copied;
}
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const content = document.getElementById(button.dataset.copy).textContent;
  const success = await copyText(content);
  showToast(success ? '代码已复制' : '复制未成功，请选中代码手动复制');
}));

const navigationLinks = [...document.querySelectorAll('.sidebar nav a')];
const sections = navigationLinks.map(link => document.querySelector(link.getAttribute('href')));
let scrollScheduled = false;
function updateNavigation() {
  const topOffset = window.innerWidth <= 980 ? 145 : 105;
  let current = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= topOffset) current = section;
  }
  navigationLinks.forEach(link => {
    const active = link.getAttribute('href') === `#${current.id}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
  });
  scrollScheduled = false;
}
window.addEventListener('scroll', () => {
  if (!scrollScheduled) { scrollScheduled = true; requestAnimationFrame(updateNavigation); }
}, { passive: true });
window.addEventListener('resize', updateNavigation);
updateNavigation();
