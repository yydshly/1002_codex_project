(() => {
  'use strict';
  // Deterministic local SVG rules: no model, API or remote service is called.
  const stage = document.getElementById('stage');
  const byId = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const defaults = () => ({ lampX: 0, lampY: 0, brightness: 0.25, warmth: 0.5, artWidth: 225, artHeight: 175 });
  const definitions = {
    move: { context: '台灯 / 改变位置', label: '上下文：移动台灯', rule: '水平和垂直拖动，分别改变台灯的 x、y 位置。位置限制在本地预设范围内。' },
    light: { context: '室内灯光 / 亮度与色温', label: '上下文：调整光照', rule: '向右提高亮度，向上增加暖色。映射是本地预设规则，数值不代表真实照度或色温。' },
    resize: { context: '挂画 / 改变宽高', label: '上下文：缩放挂画', rule: '向右增加挂画宽度，向上增加高度。宽高由本地规则分别调整。' }
  };
  let mode = 'move';
  let scene = defaults();
  let drag = null;
  let activePointer = null;
  let lastLogAt = 0;
  const log = [];

  function renderScene() {
    byId('lamp').setAttribute('transform', `translate(${scene.lampX} ${scene.lampY})`);
    byId('lamp-shadow').setAttribute('cx', 330 + scene.lampX);
    byId('lamp-shadow').setAttribute('cy', 448 + scene.lampY);
    byId('lamp-glow').setAttribute('cx', 326 + scene.lampX);
    byId('lamp-glow').setAttribute('cy', 285 + scene.lampY);
    byId('lamp-glow').setAttribute('opacity', scene.brightness);
    byId('light-overlay').setAttribute('opacity', (scene.brightness - 0.1) * 0.38);
    byId('light-overlay').setAttribute('fill', `hsl(${Math.round(45 - scene.warmth * 20)} 75% 75%)`);
    const width = scene.artWidth;
    const height = scene.artHeight;
    for (const id of ['art-clip-rect', 'art-paper']) {
      byId(id).setAttribute('width', width);
      byId(id).setAttribute('height', height);
    }
    for (const id of ['art-frame', 'art-shadow']) {
      byId(id).setAttribute('width', width + 20);
      byId(id).setAttribute('height', height + 20);
    }
    byId('art-shapes').setAttribute('transform', `translate(530 105) scale(${width / 225} ${height / 175})`);
    byId('scene-context').textContent = definitions[mode].label;
    byId('context-value').textContent = definitions[mode].context;
    byId('rule-value').textContent = definitions[mode].rule;
    let result;
    if (mode === 'move') result = `台灯位置：x ${Math.round(326 + scene.lampX)} · y ${Math.round(441 + scene.lampY)}`;
    if (mode === 'light') result = `本地亮度系数 ${scene.brightness.toFixed(2)} · 暖色比例 ${Math.round(scene.warmth * 100)}%`;
    if (mode === 'resize') result = `挂画：宽 ${Math.round(width)} × 高 ${Math.round(height)}（场景坐标）`;
    byId('result-value').textContent = result;
    return result;
  }

  function applyDelta(start, dx, dy) {
    if (mode === 'move') {
      scene.lampX = clamp(start.lampX + dx, -180, 100);
      scene.lampY = clamp(start.lampY + dy, -60, 40);
    } else if (mode === 'light') {
      scene.brightness = clamp(start.brightness + dx / 650, 0.1, 0.75);
      scene.warmth = clamp(start.warmth - dy / 300, 0, 1);
    } else {
      scene.artWidth = clamp(start.artWidth + dx, 100, 340);
      scene.artHeight = clamp(start.artHeight - dy, 80, 235);
    }
    byId('delta-value').textContent = `Δx ${Math.round(dx)} · Δy ${Math.round(dy)}`;
    return renderScene();
  }

  // Inverse SVG transform accounts for CSS size and preserveAspectRatio.
  function toScene(event) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(stage.getScreenCTM().inverse());
    return { x: point.x, y: point.y };
  }
  function showPosition(point) {
    byId('position-value').textContent = `x ${(point.x / 960).toFixed(3)} · y ${(point.y / 540).toFixed(3)}`;
  }
  function addLog(type, detail = '') {
    log.unshift(`${type}${detail ? ` · ${detail}` : ''}`);
    log.splice(6);
    byId('event-log').replaceChildren(...log.map(entry => {
      const item = document.createElement('li');
      item.textContent = entry;
      return item;
    }));
  }
  function inspectEvent(event, point) {
    byId('event-value').textContent = event.type;
    byId('pointer-type').textContent = event.pointerType;
    showPosition(point);
    if (event.type === 'pointermove') {
      const now = performance.now();
      if (now - lastLogAt >= 120) {
        addLog('pointermove', `${Math.round(point.x)}, ${Math.round(point.y)}`);
        lastLogAt = now;
      }
    } else addLog(event.type, `${Math.round(point.x)}, ${Math.round(point.y)}`);
  }
  function drawPointer(point) {
    byId('pointer-mark').setAttribute('visibility', 'visible');
    byId('pointer-dot').setAttribute('cx', point.x);
    byId('pointer-dot').setAttribute('cy', point.y);
    byId('pointer-track').setAttribute('d', `M${drag.point.x} ${drag.point.y}L${point.x} ${point.y}`);
  }
  function endDrag(event, cancel = false) {
    if (activePointer !== event.pointerId || !drag) return;
    const point = toScene(event);
    if (cancel) {
      scene = { ...drag.scene };
      byId('delta-value').textContent = 'Δx 0 · Δy 0';
      renderScene();
    } else applyDelta(drag.scene, point.x - drag.point.x, point.y - drag.point.y);
    inspectEvent(event, point);
    byId('announcement').textContent = `${cancel ? '拖动取消并还原。' : '拖动结束。'}${byId('result-value').textContent}`;
    drag = null;
    const pointer = activePointer;
    activePointer = null;
    if (stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer);
    stage.classList.remove('dragging');
    byId('pointer-mark').setAttribute('visibility', 'hidden');
  }

  stage.addEventListener('pointerdown', event => {
    if (activePointer !== null || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    stage.focus({ preventScroll: true });
    const point = toScene(event);
    activePointer = event.pointerId;
    drag = { point, scene: { ...scene } };
    lastLogAt = performance.now();
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('dragging');
    byId('delta-value').textContent = 'Δx 0 · Δy 0';
    inspectEvent(event, point);
    drawPointer(point);
  });
  stage.addEventListener('pointermove', event => {
    if (activePointer !== event.pointerId || !drag) return;
    const point = toScene(event);
    applyDelta(drag.scene, point.x - drag.point.x, point.y - drag.point.y);
    inspectEvent(event, point);
    drawPointer(point);
  });
  stage.addEventListener('pointerup', event => endDrag(event));
  stage.addEventListener('pointercancel', event => endDrag(event, true));
  stage.addEventListener('lostpointercapture', () => {
    if (activePointer === null) return;
    scene = { ...drag.scene };
    drag = null;
    activePointer = null;
    stage.classList.remove('dragging');
    byId('pointer-mark').setAttribute('visibility', 'hidden');
    byId('delta-value').textContent = 'Δx 0 · Δy 0';
    byId('event-value').textContent = 'lostpointercapture';
    addLog('lostpointercapture', '拖动已还原');
    byId('announcement').textContent = `指针捕获丢失，拖动已还原。${renderScene()}`;
  });

  function reset({ clearEvents = true } = {}) {
    const pointer = activePointer;
    activePointer = null;
    drag = null;
    if (pointer !== null && stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer);
    scene = defaults();
    stage.classList.remove('dragging');
    byId('pointer-mark').setAttribute('visibility', 'hidden');
    byId('position-value').textContent = '—';
    byId('delta-value').textContent = 'Δx 0 · Δy 0';
    if (clearEvents) {
      log.splice(0);
      byId('event-value').textContent = '等待输入';
      byId('pointer-type').textContent = '—';
      byId('event-log').replaceChildren();
    }
    byId('announcement').textContent = `场景已还原。${renderScene()}`;
  }
  stage.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      reset({ clearEvents: false });
      byId('event-value').textContent = 'keydown · Escape';
      byId('pointer-type').textContent = '键盘';
      addLog('keydown', 'Escape · 重置');
      return;
    }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[event.key] || activePointer !== null) return;
    event.preventDefault();
    const step = event.shiftKey ? 40 : 12;
    const [x, y] = directions[event.key];
    const result = applyDelta({ ...scene }, x * step, y * step);
    byId('position-value').textContent = '键盘：无指针位置';
    byId('event-value').textContent = `keydown · ${event.key}`;
    byId('pointer-type').textContent = '键盘';
    addLog('keydown', `${event.key}${event.shiftKey ? ' + Shift' : ''}`);
    byId('announcement').textContent = result;
  });
  document.querySelectorAll('input[name="mode"]').forEach(input => {
    input.addEventListener('change', () => { mode = input.value; reset(); });
  });
  byId('reset').addEventListener('click', () => reset());
  renderScene();
})();
