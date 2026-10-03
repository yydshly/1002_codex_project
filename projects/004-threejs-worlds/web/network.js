export function initNetworkDemo(root) {
  if (!root) return { destroy() {} };
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const steps = [
    ['同一个房间地址', 'A、B、C 打开相同的 world 与 room 地址，准备加入同一个空间。'],
    ['公共服务帮助发现', '信令服务帮助参与者发现彼此，并交换建立连接所需的信息。'],
    ['建立点对点连接', '在这里示意浏览器之间通过 WebRTC 交换数据；实际网络也可能需要中继。'],
    ['同步状态，各自渲染', '发送角色位置、朝向和动作等少量数据，每个浏览器用 Three.js 绘制自己的画面。'],
  ];
  const fragment = document.createDocumentFragment();
  const diagram = make('div', 'network-diagram');
  diagram.setAttribute('role', 'img');
  diagram.setAttribute('aria-label', '三个浏览器借助公共信令服务发现彼此，随后同步角色位置');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('network-lines');
  svg.setAttribute('viewBox', '0 0 1000 460');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  [['network-signal', 'M 170 330 L 500 90 M 500 330 L 500 90 M 830 330 L 500 90'],
    ['network-peer', 'M 170 330 L 500 330 L 830 330 M 170 330 Q 500 470 830 330']].forEach(([className, d]) => {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', className);
    path.setAttribute('fill', 'none');
    svg.append(path);
  });
  diagram.append(svg);
  const relay = make('div', 'network-relay');
  relay.append(make('span', 'network-node-kicker', 'SIGNALING'), make('strong', '', '公共信令服务'), make('small', '', '帮助连接双方发现彼此'));
  relay.style.left = '50%'; relay.style.top = '20%';
  diagram.append(relay);
  const avatars = [], nodeStatus = [];
  ['A', 'B', 'C'].forEach((name, index) => {
    const node = make('div', `network-node network-node-${name.toLowerCase()}`);
    node.style.left = `${17 + index * 33}%`; node.style.top = '72%';
    const screen = make('div', 'network-screen');
    const avatar = make('span', 'network-avatar', '●');
    avatar.setAttribute('aria-hidden', 'true');
    screen.append(make('span', 'network-island'), avatar);
    const status = make('small', 'network-node-status', '等待进入房间');
    node.append(make('strong', '', `浏览器 ${name}`), screen, status);
    avatars.push(avatar); nodeStatus.push(status); diagram.append(node);
  });
  const stepList = make('ol', 'network-steps');
  const stepItems = steps.map(([title], index) => {
    const item = make('li', 'network-step');
    item.append(make('span', 'network-step-number', String(index + 1)), make('span', '', title));
    stepList.append(item); return item;
  });
  const copy = make('p', 'network-description');
  const controls = make('div', 'network-controls controls');
  const next = make('button', 'primary', '下一步');
  const play = make('button', 'secondary', '自动演示');
  const move = make('button', 'secondary', '移动 A 的角色');
  [next, play, move].forEach(button => { button.type = 'button'; });
  const delayLabel = make('label', 'network-delay', '模拟同步延迟');
  const delay = make('input', 'network-delay-input');
  delay.type = 'range'; delay.min = '0'; delay.max = '1200'; delay.step = '100'; delay.value = '500';
  delay.setAttribute('aria-label', '模拟同步延迟，毫秒');
  const delayValue = make('output', 'network-delay-value', '500 ms');
  delayLabel.append(delay, delayValue);
  controls.append(next, play, move, delayLabel);
  const status = make('p', 'network-status');
  status.setAttribute('aria-live', 'polite');
  const note = make('p', 'network-note', '本地流程模拟，未连接其他玩家。原站采用 Trystero / WebRTC 组织多人通信，本示例用可视化解释其机制。Three.js 负责绘制，联网由额外技术实现。');
  fragment.append(diagram, stepList, copy, controls, status, note); root.append(fragment);
  let step = 0, loop = null, offset = -22, pending = [], destroyed = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clearPending = () => { pending.forEach(clearTimeout); pending = []; };
  const stop = () => { clearInterval(loop); loop = null; play.textContent = '自动演示'; play.setAttribute('aria-pressed', 'false'); };
  const showStep = () => {
    diagram.dataset.step = String(step + 1);
    stepItems.forEach((item, index) => {
      item.classList.toggle('active', index === step);
      if (index === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    });
    copy.textContent = steps[step][1];
    status.textContent = `本地模拟 · 步骤 ${step + 1} / 4 · ${steps[step][0]}`;
    next.textContent = step === 3 ? '重新开始' : '下一步';
    nodeStatus.forEach(node => { node.textContent = ['房间 commons', '正在交换信令', '数据通道已连接', '各自绘制相同状态'][step]; });
  };
  const advance = () => {
    clearPending();
    offset = -22;
    avatars.forEach(avatar => { avatar.style.transform = 'translateX(0px)'; });
    step = (step + 1) % 4;
    showStep();
  };
  next.addEventListener('click', advance);
  play.setAttribute('aria-pressed', 'false');
  play.addEventListener('click', () => {
    if (loop) return stop();
    if (reducedMotion.matches) { status.textContent = '已遵循减少动态效果设置，请用“下一步”手动查看。'; return; }
    loop = setInterval(advance, 2400); play.textContent = '暂停演示'; play.setAttribute('aria-pressed', 'true');
  });
  delay.addEventListener('input', () => { delayValue.value = `${delay.value} ms`; });
  move.addEventListener('click', () => {
    stop(); clearPending(); step = 3; showStep(); offset = offset === -22 ? 22 : -22;
    avatars[0].style.transform = `translateX(${offset}px)`;
    nodeStatus[0].textContent = '本机位置已更新';
    nodeStatus[1].textContent = nodeStatus[2].textContent = '等待位置数据…';
    status.textContent = `本地模拟 · A 已移动，B 和 C 在 ${delay.value} ms 后收到相同位置。`;
    const timer = setTimeout(() => {
      if (destroyed) return;
      avatars.slice(1).forEach(avatar => { avatar.style.transform = `translateX(${offset}px)`; });
      nodeStatus[1].textContent = nodeStatus[2].textContent = '位置已同步，画面已更新';
      status.textContent = '本地模拟 · 三端位置一致，各自渲染画面。网络传递状态数据，而不是整幅视频。';
    }, Number(delay.value));
    pending.push(timer);
  });
  const onReducedMotion = () => { if (reducedMotion.matches) stop(); };
  reducedMotion.addEventListener('change', onReducedMotion);
  showStep();
  return { destroy() { destroyed = true; stop(); clearPending(); reducedMotion.removeEventListener('change', onReducedMotion); root.replaceChildren(); } };
}
