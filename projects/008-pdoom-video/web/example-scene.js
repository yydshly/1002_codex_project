// A new six-second scene. Shared geometry, Clawd, brushes, keyframes and renderAt
// come from the unchanged PDoomVideo core.js / clawd.js vendored beside this file.
(() => {
  const DURATION = 6;
  const STYLES = {
    warm: { name: '暖色水彩', paper: '#F3EBDC', ink: '#2B2233', clay: '#D97757', clayDk: '#A84D33', clayLt: '#F2A283', cream: '#FFF5E2', ochre: '#E8AA38', teal: '#3A9C98', floor: '#DEC9A8', panel: '#E5D8C1', light: '#FFD970', watercolor: true },
    cool: { name: '冷色水彩', paper: '#E6EEF4', ink: '#243554', clay: '#7192CC', clayDk: '#42618F', clayLt: '#B0CBEA', cream: '#F7FCFF', ochre: '#60B7D0', teal: '#539DAB', floor: '#C0D3DE', panel: '#D2E0E9', light: '#9BE3F0', watercolor: true },
    flat: { name: '清晰平涂', paper: '#F7F7EF', ink: '#203531', clay: '#5AA890', clayDk: '#377F6B', clayLt: '#A3D5B4', cream: '#FFFFFF', ochre: '#E7B84A', teal: '#468D78', floor: '#E5EBE2', panel: '#D7E0D8', light: '#FFE38A', watercolor: false },
  };
  const SHOTS = [
    { start: 0, end: .8, sample: .4, title: '发现', story: '角色看见右侧的按钮和熄灭的灯泡，向右侧张望。', implementation: '眼睛朝右；右手轻抬；灯泡保持熄灭。' },
    { start: .8, end: 2.4, sample: 1.6, title: '走近', story: '角色走向按钮，腿交替移动，身体轻轻上下起伏。', implementation: 'x 从 460 插值到 1030；walk 随时间变化。' },
    { start: 2.4, end: 3.5, sample: 3.25, title: '按下', story: '角色伸出右手按下红色按钮，按钮下降，灯泡亮起。', implementation: '右手角度变化；按钮下降；3.25 秒打开灯。' },
    { start: 3.5, end: 6, sample: 4.5, title: '庆祝', story: '灯泡持续发光，角色微笑、举起双手，小幅跳跃。', implementation: 'happy 眼睛；双臂上举；身体位移与挤压。' },
  ];
  let styleKey = 'warm', layer = 'paper';
  const papers = new Map(), originalPaint = paint;

  // This is the actual motion function used to render every frame, not UI text.
  function pose(t) {
    t = clamp(t, 0, DURATION);
    const walking = t >= .8 && t < 2.4;
    const press = kf(t, [[0, 0], [2.4, 0], [3.25, 1], [3.5, 0]]);
    const celebrate = seg(t, 3.5, 4);
    const bounce = t >= 3.5 ? Math.max(0, Math.sin((t - 3.5) * Math.PI * 3)) * celebrate : 0;
    return {
      t, shot: SHOTS.findIndex(s => t < s.end) < 0 ? 3 : SHOTS.findIndex(s => t < s.end),
      x: kf(t, [[0, 460], [.8, 460], [2.4, 1030], [6, 1030]]),
      y: 800 - (walking ? Math.abs(Math.sin(t * 9)) * 9 : bounce * 42),
      walk: walking ? t * 1.7 : 0,
      aL: walking ? .25 + Math.sin(t * 9) * .4 : lerp(.3, 1.55, celebrate),
      aR: walking ? .25 - Math.sin(t * 9) * .4 : kf(t, [[0, .3], [.8, .3], [2.4, .3], [3.1, -.15], [3.25, -.25], [3.5, .3], [4, 1.55], [6, 1.55]]),
      sq: bounce * -.08, press,
      light: t >= 3.25 ? easeOut(seg(t, 3.25, 3.65)) : 0,
      on: t >= 3.25,
      eyes: t >= 3.5 ? 'happy' : 'look', mouth: t >= 3.5 ? 'smile' : '',
    };
  }

  // Keep the upstream watercolor path for the finished watercolor variants.
  // The teaching layers isolate outline, flat color and brush fill, in order.
  paint = (pts, options = {}) => {
    const s = STYLES[styleKey], o = { ...options };
    if (layer === 'outline') {
      originalPaint(pts, { ink: s.ink, sw: o.sw ?? .8, curv: o.curv, br: o.br });
    } else if (layer === 'flat' || !s.watercolor) {
      originalPaint(pts, { wash: o.wash || o.fill, washOp: o.washOp ?? o.fillOp ?? 255, ink: o.ink, sw: o.sw, curv: o.curv, br: o.br });
    } else originalPaint(pts, o);
  };

  function button(p, s) {
    const depression = p.press * 13;
    paint(rrPts(1175, 685, 165, 115, 10, 1.5), { wash: s.panel, fill: s.floor, fillOp: 80, tex: .6, ink: s.ink, sw: 1 });
    paint(ellPts(1255, 688 + depression, 59, 17, 20, 1), { wash: s.clayDk, ink: s.ink, sw: .8 });
    paint(rrPts(1198, 657 + depression, 114, 31, 9, 1), { wash: '#D66F62', fill: s.clayDk, fillOp: 40, ink: s.ink, sw: .9 });
    paint(ellPts(1255, 660 + depression, 56, 15, 20, 1), { wash: '#EA9480', fill: s.cream, fillOp: 50, ink: s.ink, sw: .8 });
    letter('PRESS', 1255, 745, 27, s.ink, { font: '700 27px sans-serif', ink: false });
  }

  function bulb(p, s) {
    const cx = 1490, cy = 340;
    if (p.light > 0) {
      paint(ellPts(cx, cy, 225, 220, 28, 3), { fill: s.light, fillOp: 55 * p.light, bleed: .28, tex: .55, border: .1, ink: null });
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8, r = 160, dx = Math.cos(a), dy = Math.sin(a), w = 3.5;
        paint([[cx + dx * r - dy * w, cy + dy * r + dx * w], [cx + dx * (r + 32) - dy * w, cy + dy * (r + 32) + dx * w], [cx + dx * (r + 32) + dy * w, cy + dy * (r + 32) - dx * w], [cx + dx * r + dy * w, cy + dy * r - dx * w]], { wash: s.ochre, washOp: 220 * p.light, ink: null });
      }
    }
    inkLine([[cx, 140], [cx, 215]], 1.2, s.ink, 'inkfine', 0);
    paint(ellPts(cx, cy, 96, 112, 26, 1.5), { wash: mixCol(s.panel, s.light, p.light), fill: p.on ? s.ochre : s.cream, fillOp: p.on ? 100 : 65, bleed: .12, tex: .7, border: .55, ink: s.ink, sw: 1.2 });
    paint(rrPts(cx - 38, cy + 96, 76, 46, 7, 1), { wash: s.floor, ink: s.ink, sw: .9 });
    for (let i = 0; i < 3; i++) inkLine([[cx - 35, cy + 105 + i * 10], [cx + 35, cy + 105 + i * 10]], .7, s.ink, 'inkfine', 0);
    inkLine([[cx - 23, cy + 90], [cx - 25, cy + 18], [cx - 10, cy + 32], [cx, cy + 10], [cx + 12, cy + 32], [cx + 25, cy + 18], [cx + 23, cy + 90]], .85, s.ink, 'inkfine', .15);
    letter(p.on ? 'ON' : 'OFF', cx, 557, 34, p.on ? s.teal : s.ink, { font: '700 34px sans-serif', ink: false });
  }

  // The core calls this function with the requested frame time.
  window.drawWorld = t => {
    const s = STYLES[styleKey], p = pose(t);
    paint(ellPts(980, 824, 790, 96, 30, 3), { fill: s.floor, fillOp: 130, bleed: .18, tex: .65, ink: null });
    inkLine([[240, 804], [1720, 804]], .9, s.ink, 'inkfine', .05);
    inkLine([[1320, 726], [1510, 726], [1510, 494]], .8, p.on ? s.teal : s.ink, 'inkfine', .1);
    bulb(p, s);
    button(p, s);
    clawd(p.x, p.y, 32, { walk: p.walk, aL: p.aL, aR: p.aR, sq: p.sq, eyes: p.eyes, lookX: .8, lookY: -.2, mouth: p.mouth, col: s.clay, dk: s.clayDk, lt: s.clayLt });
    if (t < .8) letter('?', p.x + 170, 426, 64, s.ink, { font: '700 64px sans-serif', ink: false });
    letter('ONE SMALL ACTION', 300, 230, 44, s.ink, { align: 'left', font: '700 44px sans-serif', ink: false });
    letter('IDEA → LIGHT', 300, 285, 26, s.teal, { align: 'left', font: '500 26px sans-serif', ink: false });
    window.scenarioLastPose = p;
    flushLetters();
  };
  window.drawKaraokeText = () => {};

  // Core composition, with the paper overlay isolated for the teaching layers.
  composite = () => {
    const c = outX;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.drawImage(drawingContext.canvas, 0, 0, W, H);
    drawLetters(c);
    if (layer === 'paper' && STYLES[styleKey].watercolor) {
      c.globalCompositeOperation = 'multiply'; c.drawImage(grainC, 0, 0);
      c.globalCompositeOperation = 'source-over';
    }
  };

  window.scenarioRender = async (t, style = 'warm', paintingLayer = 'paper') => {
    if (!window.ready) throw new Error('Drawing engine is not ready');
    if (!Object.hasOwn(STYLES, style) || !['outline', 'flat', 'brush', 'paper'].includes(paintingLayer)) throw new Error('Unknown style or painting layer');
    if (!Number.isFinite(t) || t < 0 || t > DURATION) throw new Error('Time must be between 0 and 6 seconds');
    styleKey = style; layer = paintingLayer;
    Object.assign(PAL, STYLES[style]);
    const paperKey = `${style}-${paintingLayer === 'paper' && STYLES[style].watercolor ? 'texture' : 'plain'}`;
    if (!papers.has(paperKey)) {
      const g = paperKey.endsWith('texture') ? makePaper() : createGraphics(W, H);
      if (paperKey.endsWith('plain')) { g.pixelDensity(1); g.background(PAL.paper); }
      papers.set(paperKey, g);
    }
    paperG = papers.get(paperKey);
    brush.seed(1000 + Math.floor(t * 12));
    brush.noiseSeed(77);
    const start = performance.now();
    const url = await window.renderAt(t, 'image/jpeg', .9);
    return { url, renderMs: performance.now() - start, pose: pose(t), style, layer };
  };
  window.scenarioDefinition = { duration: DURATION, styles: STYLES, shots: SHOTS, pose, source: 'example-scene.js', reused: ['vendor/pdoom/core.js', 'vendor/pdoom/clawd.js'] };
})();
