import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoRoot = path.join(project, 'web/demo');
const readJson = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const demo = await readJson(path.join(demoRoot, 'demo.json'));
const validation = await readJson(path.join(project, 'notes/validation.json'));
const manifest = await readJson(path.join(demoRoot, demo.manifest));
if (validation.status !== 'passed' || validation.stages.some(stage => stage.status !== 'passed')) {
  throw new Error('仅允许将通过验证的实际输出同步到页面。');
}
const animation = manifest.animation.rows.wave;
if (animation.fps !== demo.fps) throw new Error('播放器配置与原生 manifest 的 fps 不一致。');
const measurements = validation.stages.find(stage => stage.stage === 'compose-atlas').measurement;
const stageNames = {
  cutout:'色键抠图', 'slice-sheet':'网格切帧', 'unpack-atlas':'导入透明帧',
  'unpack-atlas-roundtrip':'图集拆分往返检查', 'compose-atlas':'组装透明图集',
  'compose-gif':'组装 GIF 预览', 'recolor-palette':'提取调色清单',
  recolor:'生成两种配色变体', 'export-aseprite':'导出 Aseprite 兼容 JSON',
  'export-pngs':'导出逐帧 PNG'
};
const prefix = file => `demo/${file}`;
const view = {
  frames:manifest.frame_layout.rows.wave,
  cellWidth:manifest.frame_layout.cellWidth,
  cellHeight:manifest.frame_layout.cellHeight,
  sheetWidth:manifest.frame_layout.sheetWidth,
  sheetHeight:manifest.frame_layout.sheetHeight,
  fps:animation.fps,
  loop:animation.loop,
  images:{input:prefix(demo.input),alpha:prefix(demo.atlas),variant:prefix(demo.variants[0].atlas)},
  alphaPercent:Number((measurements.transparentPixels / (measurements.width * measurements.height) * 100).toFixed(1)),
  artifacts:[
    {title:'透明图集 PNG',path:prefix(demo.atlas)},
    {title:'帧坐标 manifest',path:prefix(demo.manifest)},
    {title:'Aseprite JSON',path:prefix(demo.exports.asepriteJson)},
    {title:'透明 GIF',path:prefix(demo.gif)},
    {title:'日落配色 PNG',path:prefix(demo.variants[0].atlas)},
    {title:'紫色配色 PNG',path:prefix(demo.variants[1].atlas)}
  ],
  stages:validation.stages.map(stage=>({name:stageNames[stage.stage]||stage.stage,command:stage.command})),
  scope:`使用独立 Python venv 运行 sprite-gen ${validation.version} 的 ${validation.stages.length} 个 CLI 步骤，验证了透明帧、图集矩形、换色透明度及导出结构。`
};
await writeFile(path.join(project, 'web/demo-data.js'), `// 从真实 CLI 输出与验证记录生成；运行 node scripts/sync-demo.mjs 更新。\nwindow.SPRITE_DEMO = ${JSON.stringify(view,null,2)};\n`);
await writeFile(path.join(demoRoot, 'validation.json'), `${JSON.stringify(validation,null,2)}\n`);
console.log(`展示数据已同步：${view.frames.length} 帧，${view.stages.length} 个已验证步骤。`);
