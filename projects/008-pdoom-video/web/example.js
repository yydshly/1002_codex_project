const $ = selector => document.querySelector(selector);
const image = $('#example-image'), video = $('#example-video'), slider = $('#frame'), play = $('#play');
let manifest, style = 'warm', index = 0, animation = 0, playing = false;
const base = 'assets/example/';
const frameFile = (key, n) => `${base}${key}/f${String(n).padStart(3, '0')}.jpg`;
const toIndex = t => Math.min(manifest.frameCount - 1, Math.floor(Math.max(0, t) * manifest.fps + 1e-6));

function update(n, updateImage = true) {
  if (!manifest) return;
  index = Math.max(0, Math.min(manifest.frameCount - 1, n));
  const frame = manifest.styles[style].frameTimes[index], p = frame.pose, shot = manifest.shots[p.shot];
  if (updateImage) image.src = frameFile(style, index);
  image.alt = `${manifest.styles[style].name}，${frame.time.toFixed(2)} 秒：${shot.story}`;
  slider.value = String(index);
  $('#time').textContent = `${frame.time.toFixed(2)} / 6.00 s`;
  $('#frame-label').textContent = `FRAME ${String(index).padStart(3, '0')} / 071`;
  $('#action-title').textContent = shot.title;
  $('#action-story').textContent = shot.story;
  $('#pose-x').textContent = p.x.toFixed(1);
  $('#pose-y').textContent = p.y.toFixed(1);
  $('#pose-arm').textContent = (p.aR * 180 / Math.PI).toFixed(1);
  $('#pose-press').textContent = Math.round(p.press * 100);
  $('#pose-light').textContent = p.on ? `亮起 · ${Math.round(p.light * 100)}%` : '熄灭';
  $('#studio-link').href = `example-studio.html?t=${frame.time}&style=${style}`;
  document.querySelectorAll('[data-shot]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.shot) === p.shot)));
  window.exampleState = { style, index, time: frame.time, pose: p, playing };
}

function pause() {
  playing = false; video.pause(); cancelAnimationFrame(animation);
  video.hidden = true; image.hidden = false; play.textContent = '▶ 播放 6 秒成片';
  update(index);
}

function tick() {
  if (!playing) return;
  update(toIndex(video.currentTime), false);
  animation = requestAnimationFrame(tick);
}

play.addEventListener('click', async () => {
  if (playing) { pause(); return; }
  if (index >= manifest.frameCount - 1) update(0);
  video.currentTime = index / manifest.fps;
  video.hidden = false; image.hidden = true;
  try {
    await video.play(); playing = true; play.textContent = 'Ⅱ 暂停，查看这一帧'; tick();
  } catch { video.hidden = true; image.hidden = false; $('#load-status').textContent = '播放未开始，可拖动时间逐帧查看，或下载 MP4。'; }
});
video.addEventListener('ended', () => { index = manifest.frameCount - 1; pause(); });
video.addEventListener('error', () => { pause(); $('#load-status').textContent = '视频加载失败，可逐帧查看或下载成片。'; });
$('#restart').addEventListener('click', () => { pause(); update(0); });
slider.addEventListener('input', () => { const next = Number(slider.value); pause(); update(next); });
document.querySelectorAll('[data-shot]').forEach(button => button.addEventListener('click', () => { pause(); update(toIndex(manifest.shots[Number(button.dataset.shot)].sample)); }));

function setStyle(key) {
  pause(); style = key;
  const s = manifest.styles[key];
  video.src = base + s.video; video.load();
  $('#style-label').textContent = s.name;
  document.querySelectorAll('[data-style]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.style === key)));
  const colors = [s.paper, s.clay, s.clayDk, s.light];
  $('#palette').replaceChildren(...colors.map(color => { const swatch = document.createElement('span'); swatch.style.backgroundColor = color; swatch.title = color; return swatch; }));
  $('#palette-values').textContent = `纸张 ${s.paper} · 角色 ${s.clay} · 阴影 ${s.clayDk} · 灯光 ${s.light}`;
  $('#brush-title').textContent = s.watercolor ? '水彩渗边 + 墨线' : '统一平涂 + 墨线';
  $('#brush-description').textContent = s.watercolor ? '调用原始 paint() 与 p5.brush，使用水彩填充、亮暗叠色、渗边和纹理。' : '同一套形状改用纯色 wash 填充，保留墨线；跳过水彩纹理。';
  $('#paper-title').textContent = s.watercolor ? '纸纹 + 颗粒合成' : '纯色背景';
  $('#paper-description').textContent = s.watercolor ? '沿用上游 makePaper() 生成纸张，最后叠加纸纹颗粒，让颜料呈现在纸面上。' : '使用纯色底图，关闭纸张颗粒覆盖，让形状与颜色更加清晰。';
  $('#download').href = base + s.video;
  $('#download').download = `点亮一盏灯-${s.name}.mp4`;
  $('#download').textContent = `下载${s.name} MP4 ↓`;
  update(index);
}
document.querySelectorAll('[data-style]').forEach(button => button.addEventListener('click', () => setStyle(button.dataset.style)));

const layers = {
  outline: '这是教学用的轮廓视图，方便看清组成画面的形状。实际成帧时，代码按图层顺序绘制每个形状的颜色、纹理和描边。',
  flat: '每个形状开始带上底色；角色、按钮、灯泡分别使用代码中指定的颜色和透明度。这里暂时关闭水彩纹理。',
  brush: '恢复原始水彩绘画路径：角色亮部和暗部叠色，灯泡周围产生晕染，形状边缘带上颜料渗色和纹理。',
  paper: '在完整彩色画面上合成纸张颗粒。这就是 3.75 秒时，实际用于暖色水彩成片的画面。',
};
document.querySelectorAll('[data-layer]').forEach(button => button.addEventListener('click', () => {
  const layer = button.dataset.layer;
  $('#layer-image').src = `${base}layer-${layer}.jpg`;
  $('#layer-image').alt = `固定 3.75 秒暖色画面的${button.querySelector('strong').textContent}`;
  $('#layer-description').textContent = layers[layer];
  document.querySelectorAll('[data-layer]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
}));

try {
  const response = await fetch(base + 'manifest.json');
  if (!response.ok) throw new Error('实际渲染记录加载失败');
  manifest = await response.json();
  if (manifest.frameCount !== 72 || manifest.fps !== 12 || Object.keys(manifest.styles).length !== 3) throw new Error('实际渲染记录格式不匹配');
  document.querySelectorAll('button:disabled, input:disabled').forEach(control => { control.disabled = false; });
  setStyle('warm');
  $('#load-status').textContent = '实际绘制已完成：三种风格各 72 帧，已编码为 6 秒 MP4。播放无需调用模型。';
  document.body.dataset.ready = 'true';
} catch(error) { $('#load-status').textContent = error.message + '，请稍后刷新。'; document.body.dataset.ready = 'error'; }
window.addEventListener('pagehide', () => { cancelAnimationFrame(animation); video.pause(); });
