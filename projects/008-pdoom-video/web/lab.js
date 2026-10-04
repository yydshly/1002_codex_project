const WIDTH = 960;
const HEIGHT = 540;
const DURATION = 8;
const TAU = Math.PI * 2;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pure, inspectable animation parameters. Every render is derived from this instant. */
export function frameAt(time, bpm = 88, mode = 'jump', jitter = true) {
  const t = Math.max(0, Math.min(DURATION, Number(time) || 0));
  const tempo = Math.max(60, Math.min(140, Number(bpm) || 88));
  const beat = t * tempo / 60;
  const phase = (beat % 1) * TAU;
  const lift = Math.max(0, Math.sin(phase));
  const seed = Math.floor(t * 12);
  return {
    t, bpm: tempo, beat, phase, seed,
    drawingSeed: jitter ? seed : 0,
    x: mode === 'sway' ? Math.sin(phase) * 105 : 0,
    y: mode === 'jump' ? -lift * 117 : -Math.max(0, Math.sin(phase)) * 9,
    rotation: mode === 'sway' ? Math.sin(phase) * 0.19 : Math.sin(phase) * 0.035,
    scaleX: mode === 'jump' ? 1 + Math.cos(phase) * 0.045 : 1,
    scaleY: mode === 'jump' ? 1 - Math.cos(phase) * 0.06 : 1,
    zoom: 1.055 + Math.sin(t * 0.65) * 0.055,
    pan: Math.sin(t * 0.48) * 24,
    wipe: mode === 'wipe' ? (t % 4) / 4 : 0,
  };
}

/** Mount this standalone, dependency-free principle demo. Starts paused. */
export function initLab(element) {
  if (!element || typeof element.querySelector !== 'function') {
    throw new TypeError('initLab requires a DOM element.');
  }
  element.classList.add('principle-lab');
  element.innerHTML = `
    <div class="pl-intro">
      <div><span class="pl-kicker">可交互实验 · 8 秒时间轴</span><h3>本地原理示意</h3></div>
      <p>拖动时间，直接跳到任意一帧。这里用原生 Canvas 简化演示代码动画，<strong>不是上游 p5.brush 原画面</strong>。</p>
    </div>
    <div class="pl-workbench">
      <div class="pl-preview">
        <div class="pl-stage"><canvas width="960" height="540" role="img" aria-label="程序生成的橙色块状角色，随设定时间做跳跃、摇摆或转场；使用下方控件改变画面。"></canvas><span class="pl-stage-note">Canvas 原理示意 · 本地计算</span></div>
        <div class="pl-transport">
          <button type="button" class="pl-play" aria-pressed="false"><span aria-hidden="true">▶</span> 播放</button>
          <label class="pl-time"><span>时间 <output class="pl-time-output">0.00 s</output></span><input class="pl-time-input" type="range" min="0" max="8" step="0.01" value="0" aria-label="动画时间（秒）"><span class="pl-range-ends" aria-hidden="true"><span>0 s</span><span>4 s</span><span>8 s</span></span></label>
        </div>
        <p class="pl-tip">同一时刻 + 同一参数 → 同一画面。可暂停检查，也可在播放时调整参数。</p>
      </div>
      <div class="pl-settings">
        <fieldset class="pl-modes"><legend>01 / 选择动作</legend><div class="pl-segmented"><label><input type="radio" name="pl-mode" value="jump" checked><span>跳跃</span></label><label><input type="radio" name="pl-mode" value="sway"><span>摇摆</span></label><label><input type="radio" name="pl-mode" value="wipe"><span>转场</span></label></div></fieldset>
        <label class="pl-bpm"><span>02 / 节拍 <output class="pl-bpm-output">88 BPM</output></span><input class="pl-bpm-input" type="range" min="60" max="140" step="1" value="88" aria-label="每分钟节拍数"><span class="pl-range-ends" aria-hidden="true"><span>60</span><span>140</span></span></label>
        <fieldset class="pl-layers"><legend>03 / 画面层</legend><label><input type="checkbox" value="character" checked>角色 <span>姿态与表情</span></label><label><input type="checkbox" value="camera" checked>镜头 <span>缩放与推镜</span></label><label><input type="checkbox" value="jitter" checked>线条扰动 <span>每秒 12 个种子</span></label></fieldset>
        <button type="button" class="pl-redraw"><span aria-hidden="true">↻</span> 重绘此刻</button>
        <p class="pl-status" role="status" aria-live="polite">已暂停，拖动时间开始探索。</p>
      </div>
    </div>
    <div class="pl-inspector">
      <div class="pl-equation"><span class="pl-kicker">画面由时间决定</span><strong>画面 = f(t)</strong><p>无需从第 1 帧开始计算。</p></div>
      <dl class="pl-values"><div><dt>当前时间 t</dt><dd class="pl-value-time">0.00 <small>s</small></dd></div><div><dt>音乐节拍 beat</dt><dd class="pl-value-beat">0.00</dd></div><div><dt>时间种子 ⌊t × 12⌋</dt><dd class="pl-value-seed">0</dd></div></dl>
      <pre class="pl-code" aria-label="当前画面计算伪代码"><code><span>beat = t × BPM / 60</span><span class="pl-code-motion">y = −117 × max(0, sin(beat × 2π))</span><span>画面 = 绘制(姿态, 镜头, seed = ⌊t × 12⌋)</span></code></pre>
    </div>`;

  // Keep multiple instances independent, including their radio groups.
  const modeGroup = `principle-mode-${initLab.instanceCount = (initLab.instanceCount || 0) + 1}`;
  const q = (selector) => element.querySelector(selector);
  const all = (selector) => [...element.querySelectorAll(selector)];
  all('.pl-modes input').forEach((input) => { input.name = modeGroup; });
  const canvas = q('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot create a 2D Canvas.');
  const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.round(WIDTH * pixelRatio);
  canvas.height = Math.round(HEIGHT * pixelRatio);
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { t: 0, bpm: 88, mode: 'jump', playing: false, character: true, camera: true, jitter: true };
  const events = [];
  let request = null;
  let previousTime = null;
  let disposed = false;
  let lastPaintKey = '';

  function listen(target, name, handler) {
    target.addEventListener(name, handler);
    events.push(() => target.removeEventListener(name, handler));
  }

  const paper = document.createElement('canvas');
  paper.width = WIDTH;
  paper.height = HEIGHT;
  const paperContext = paper.getContext('2d');
  paperContext.fillStyle = '#f4efe4';
  paperContext.fillRect(0, 0, WIDTH, HEIGHT);
  const paperRandom = seededRandom(813);
  for (let i = 0; i < 1900; i += 1) {
    paperContext.fillStyle = `rgba(92, 71, 48, ${0.02 + paperRandom() * 0.045})`;
    paperContext.fillRect(paperRandom() * WIDTH, paperRandom() * HEIGHT, 1.5 + paperRandom() * 2, 1);
  }

  function draw(frame) {
    const ctx = context;
    const random = seededRandom(frame.drawingSeed);
    const wobble = (amount = 1.4) => state.jitter ? (random() - 0.5) * amount : 0;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(paper, 0, 0);

    function inkLine(points, color = '#262b36', width = 2.4) {
      ctx.beginPath();
      points.forEach(([x, y], index) => {
        const px = x + wobble();
        const py = y + wobble();
        if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    ctx.save();
    if (state.camera) {
      ctx.translate(WIDTH / 2 + frame.pan, 285);
      ctx.scale(frame.zoom, frame.zoom);
      ctx.translate(-WIDTH / 2, -285);
    }

    // Sparse scenery keeps the parameter changes easy to read.
    ctx.fillStyle = '#e6b86e';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(744, 114, 39, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 8; i += 1) {
      const a = i * TAU / 8;
      inkLine([[744 + Math.cos(a) * 51, 114 + Math.sin(a) * 51], [744 + Math.cos(a) * 62, 114 + Math.sin(a) * 62]], '#caa673', 1.8);
    }
    ctx.fillStyle = '#e3e2ce';
    ctx.beginPath();
    ctx.moveTo(-50, 388);
    ctx.bezierCurveTo(130, 345, 279, 381, 448, 375);
    ctx.bezierCurveTo(660, 365, 785, 345, 1010, 377);
    ctx.lineTo(1010, 600);
    ctx.lineTo(-50, 600);
    ctx.closePath();
    ctx.fill();
    inkLine([[50, 390], [170, 384], [270, 386], [345, 382]], '#8d967d', 1.5);
    inkLine([[612, 379], [718, 374], [859, 382], [937, 375]], '#8d967d', 1.5);
    [[160, 365], [810, 371], [880, 388]].forEach(([x, y]) => {
      inkLine([[x - 5, y], [x - 7, y - 10], [x + 1, y - 3], [x + 5, y - 13]], '#889575', 1.8);
    });

    if (state.character) {
      ctx.save();
      ctx.translate(480 + frame.x, 391);
      ctx.fillStyle = '#92967a';
      ctx.globalAlpha = 0.19;
      ctx.beginPath();
      ctx.ellipse(0, 5, 69 + frame.y * 0.19, 11 + frame.y * 0.025, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.translate(0, frame.y);
      ctx.rotate(frame.rotation);
      ctx.scale(frame.scaleX, frame.scaleY);
      const armLift = state.mode === 'jump' ? Math.max(0, Math.sin(frame.phase)) * 33 : Math.sin(frame.phase) * 15;
      inkLine([[-54, -105], [-86, -92 - armLift], [-95, -114 - armLift]], '#3d3b39', 5);
      inkLine([[54, -105], [86, -92 - armLift], [95, -114 - armLift]], '#3d3b39', 5);
      inkLine([[-29, -32], [-32, -5], [-50, -5]], '#3d3b39', 6);
      inkLine([[29, -32], [32, -5], [50, -5]], '#3d3b39', 6);
      const body = [[-65, -156], [60, -156], [60, -39], [-65, -39], [-65, -156]];
      ctx.beginPath();
      body.forEach(([x, y], index) => index ? ctx.lineTo(x + wobble(1.8), y + wobble(1.8)) : ctx.moveTo(x + wobble(1.8), y + wobble(1.8)));
      ctx.fillStyle = '#d8754f';
      ctx.fill();
      inkLine(body, '#64483d', 2.7);
      ctx.fillStyle = '#e29567';
      ctx.globalAlpha = 0.56;
      ctx.fillRect(-55, -146, 28, 96);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 6; i += 1) {
        inkLine([[38 + i * 3, -147], [41 + i * 3, -133]], '#ae5c42', 1);
      }
      // Beat-derived expressions stay reproducible when seeking backwards.
      const blink = (frame.t % 3.6) > 3.42;
      if (blink) {
        inkLine([[-31, -111], [-14, -111]], '#262b36', 4);
        inkLine([[12, -111], [29, -111]], '#262b36', 4);
      } else {
        ctx.fillStyle = '#262b36';
        ctx.fillRect(-29 + wobble(1), -122, 12, 22);
        ctx.fillRect(14 + wobble(1), -122, 12, 22);
        ctx.fillStyle = '#f4efe4';
        ctx.fillRect(-27, -119, 3, 5);
        ctx.fillRect(16, -119, 3, 5);
      }
      ctx.strokeStyle = '#262b36';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-12, -84);
      ctx.quadraticCurveTo(0 + wobble(), -70 - Math.max(0, Math.sin(frame.phase)) * 5, 12, -84);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // A simple time-based wipe illustrates a scene transition without stateful simulation.
    if (state.mode === 'wipe' && frame.wipe > 0.07) {
      const progress = Math.max(0, Math.min(1, (frame.wipe - 0.07) / 0.84));
      const edge = WIDTH * progress;
      ctx.fillStyle = '#bf6144';
      ctx.globalAlpha = 0.91;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(edge, 0);
      for (let y = 0; y <= HEIGHT; y += 18) ctx.lineTo(edge + Math.sin(y * 0.12) * 13 + wobble(6), y);
      ctx.lineTo(0, HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      if (progress > 0.29) {
        ctx.fillStyle = '#f4efe4';
        ctx.font = '600 25px system-ui, sans-serif';
        ctx.fillText('下一幕，仍由 t 决定。', 64, 275);
        ctx.font = '16px system-ui, sans-serif';
        ctx.fillText('移动时间，观察擦除进度', 64, 310);
      }
    }
    ctx.fillStyle = '#6b6d67';
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillText('t → pose → camera → draw', 30, 37);
    ctx.strokeStyle = '#c9c4b7';
    ctx.lineWidth = 1;
    ctx.strokeRect(18.5, 18.5, WIDTH - 37, HEIGHT - 37);
  }

  function paint(force = false) {
    if (disposed) return;
    const frame = frameAt(state.t, state.bpm, state.mode, state.jitter);
    const paintKey = [state.t, state.bpm, state.mode, state.character, state.camera, state.jitter].join('|');
    if (force || paintKey !== lastPaintKey) {
      draw(frame);
      lastPaintKey = paintKey;
    }
    q('.pl-time-output').textContent = `${frame.t.toFixed(2)} s`;
    q('.pl-time-input').value = String(frame.t);
    q('.pl-time-input').setAttribute('aria-valuetext', `${frame.t.toFixed(2)} 秒`);
    q('.pl-bpm-output').textContent = `${state.bpm} BPM`;
    q('.pl-value-time').innerHTML = `${frame.t.toFixed(2)} <small>s</small>`;
    q('.pl-value-beat').textContent = frame.beat.toFixed(2);
    q('.pl-value-seed').textContent = String(frame.seed);
    q('.pl-code-motion').textContent = state.mode === 'jump'
      ? 'y = −117 × max(0, sin(beat × 2π))'
      : state.mode === 'sway'
        ? 'x = 105 × sin(beat × 2π)'
        : '转场进度 = (t mod 4) / 4';
  }

  function tick(timestamp) {
    request = null;
    if (disposed || !state.playing) return;
    if (previousTime !== null) state.t = (state.t + (timestamp - previousTime) / 1000) % DURATION;
    previousTime = timestamp;
    paint();
    request = window.requestAnimationFrame(tick);
  }

  function setPlaying(playing, message) {
    state.playing = playing;
    previousTime = null;
    if (request !== null) window.cancelAnimationFrame(request);
    request = null;
    q('.pl-play').innerHTML = playing ? '<span aria-hidden="true">Ⅱ</span> 暂停' : '<span aria-hidden="true">▶</span> 播放';
    q('.pl-play').setAttribute('aria-pressed', String(playing));
    if (message) q('.pl-status').textContent = message;
    if (playing) request = window.requestAnimationFrame(tick);
  }

  listen(q('.pl-play'), 'click', () => setPlaying(!state.playing, state.playing ? '已暂停，可检查当前帧。' : '正在播放 8 秒循环；可随时暂停。'));
  listen(q('.pl-time-input'), 'input', (event) => {
    state.t = Number(event.target.value);
    previousTime = null;
    paint();
  });
  listen(q('.pl-bpm-input'), 'input', (event) => { state.bpm = Number(event.target.value); paint(); });
  all('.pl-modes input').forEach((input) => listen(input, 'change', () => { state.mode = input.value; paint(); }));
  all('.pl-layers input').forEach((input) => listen(input, 'change', () => { state[input.value] = input.checked; paint(); }));
  listen(q('.pl-redraw'), 'click', () => {
    setPlaying(false);
    paint(true);
    q('.pl-status').textContent = `已重绘 t = ${state.t.toFixed(2)} s，种子 ${Math.floor(state.t * 12)}。相同参数得到相同画面。`;
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden && state.playing) setPlaying(false, '页面进入后台，动画已暂停。');
  });
  listen(motionPreference, 'change', (event) => {
    if (event.matches) setPlaying(false, '已按照减少动态效果偏好暂停，可用时间滑块查看。');
  });
  if (motionPreference.matches) q('.pl-status').textContent = '已遵循减少动态效果偏好。拖动时间查看静止帧，或手动播放。';
  paint(true);

  return {
    getState: () => ({ ...state }),
    render: () => paint(true),
    setTime(time) { state.t = frameAt(time).t; previousTime = null; paint(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      state.playing = false;
      if (request !== null) window.cancelAnimationFrame(request);
      request = null;
      events.forEach((remove) => remove());
    },
  };
}
