import { GLTFExporter } from './realistic/vendor/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from './realistic/vendor/addons/loaders/GLTFLoader.js';
import { LoadingManager } from 'three';
import { validatePlan } from './creation-core.js';
import { validateCompletionRecipe } from './scene-completion-core.js';
import { validateFineGeometry } from './fine-geometry-core.js';
import { assertFineRefinementPreserved } from './fine-refinement-core.js';
import { makeStoredZip, inspectBinaryGLTF, inspectGeometryTree, shareIdenticalSnapshotGeometries, repackBinaryGLTFLosslessly } from './scene-delivery-core.js';

// Explicit runtime inventory: only renderer code and the assets it loads.
// The generated project has no service endpoints, CDN imports or model weights.
export const PORTABLE_RUNTIME_FILES = Object.freeze([
  'creation-core.js', 'creation-surfaces.js', 'model-scene-core.js', 'asset-generation-core.js',
  'scene-completion-core.js', 'fine-geometry-core.js', 'fine-refinement-core.js',
  'realistic/scene.js', 'realistic/terrain.js', 'realistic/world-terrain.js',
  'realistic/world-environment.js', 'realistic/fine-geometry.js',
  'realistic/vendor/three.module.js', 'realistic/vendor/three.core.js',
  'realistic/vendor/LICENSE', 'realistic/vendor/manifest.json',
  'realistic/vendor/addons/controls/OrbitControls.js',
  'realistic/vendor/addons/loaders/RGBELoader.js', 'realistic/vendor/addons/loaders/HDRLoader.js',
  'realistic/vendor/addons/loaders/GLTFLoader.js', 'realistic/vendor/addons/utils/BufferGeometryUtils.js',
  'realistic/assets/manifest.json',
  'realistic/assets/environment/coastal-day.hdr', 'realistic/assets/environment/coastal-sunset.hdr',
  ...['coast_sand_01', 'grass_ground', 'rocky_terrain', 'painted_plaster_wall', 'wood_floor'].flatMap(name =>
    ['diff', 'nor_gl', 'rough'].map(channel => `realistic/assets/textures/${name}-${channel}.jpg`)),
  'realistic/assets/models/rock_moss_set_01/rock_moss_set_01.gltf',
  'realistic/assets/models/rock_moss_set_01/rock_moss_set_01.bin',
  ...['diff', 'nor_gl', 'rough'].map(channel => `realistic/assets/models/rock_moss_set_01/textures/rock_moss_set_01_${channel}_1k.jpg`),
  'realistic/assets/models/grass_bermuda_01/grass_bermuda_01.gltf',
  'realistic/assets/models/grass_bermuda_01/grass_bermuda_01.bin',
  ...['diff', 'nor_gl', 'arm'].map(channel => `realistic/assets/models/grass_bermuda_01/textures/grass_bermuda_01_${channel}_1k.jpg`),
  'realistic/assets/models/grass_bermuda_01/textures/grass_bermuda_01_alpha_1k.png',
]);
const encode = new TextEncoder();
const jsonBytes = data => encode.encode(`${JSON.stringify(data, null, 2)}\n`);
const publishProgress = (callback, stage, message) => callback?.({ stage, message });
function inputViewFiles(views = [], prefix = 'inputs/recipe') {
  if (!Array.isArray(views) || views.length > 4) throw new Error('交付输入视图无效。');
  return views.map((view, index) => {
    const match = typeof view?.dataUrl === 'string' && view.dataUrl.length <= 12 * 1024 * 1024
      ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(view.dataUrl) : null;
    if (!match) throw new Error('交付输入视图不是有效的本地图像。');
    const path = `${prefix}/view-${index + 1}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    return { path, label: typeof view.label === 'string' ? view.label : `输入视图 ${index + 1}`,
      bytes: Uint8Array.from(atob(match[2]), character => character.charCodeAt(0)) };
  });
}
async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
async function actualInputFiles(views, receipt, plan, prefix) {
  const actual = [...(views ?? [])], expected = receipt?.images;
  // The control service may append the authored reference image. Keep that
  // actual model input in the archive even when the browser sent three views.
  if (Array.isArray(expected) && expected.length === actual.length + 1 && plan.reference
      && !actual.some(view => view.dataUrl === plan.reference.dataUrl)) {
    actual.push({ label: expected[expected.length - 1].label ?? '原始参考图', dataUrl: plan.reference.dataUrl });
  }
  const files = inputViewFiles(actual, prefix);
  if (!Array.isArray(expected)) return { files, check: { receiptImageHashesVerified: false, reason: 'no-receipt-image-record', imageCount: files.length } };
  if (expected.length !== files.length) throw new Error('交付输入图像数量与真实模型记录不一致。');
  for (const [index, file] of files.entries()) {
    if (await sha256(file.bytes) !== expected[index].sha256) throw new Error(`交付输入图像与模型读取的内容不一致：${file.path}`);
    file.label = expected[index].label ?? file.label;
  }
  return { files, check: { receiptImageHashesVerified: true, imageCount: files.length, modelJob: receipt.id ?? null } };
}
async function localFile(path, target = path) {
  const url = new URL(path, import.meta.url);
  if (url.origin !== location.origin) throw new Error('交付资源必须来自当前本地站点。');
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`项目资源缺失：${path}`);
  return { path: target, bytes: new Uint8Array(await response.arrayBuffer()) };
}
function disposeLoaded(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material);
  });
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  textures.forEach(texture => { texture.source?.data?.close?.(); texture.dispose(); });
}
const launchNode = `import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.png':'image/png','.jpg':'image/jpeg','.hdr':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{try{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const decoded=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname),relative=decoded==='/'?'index.html':decoded.slice(1);
  if(relative.split('/').some(part=>part==='..'||part==='.')||relative.includes('\\\\')||relative.includes('\\0')){res.writeHead(400);res.end();return;}
  const file=path.resolve(root,relative);if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const content=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
}catch{res.writeHead(404);res.end('File not found');}});
const port=Number(process.env.PORT||4200);server.listen(port,'127.0.0.1',()=>console.log('Open http://127.0.0.1:'+port+'/'));
`;
const launchPython = `from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path
import os
root = Path(__file__).resolve().parent
port = int(os.environ.get('PORT', '4200'))
print(f'Open http://127.0.0.1:{port}/', flush=True)
ThreadingHTTPServer(('127.0.0.1', port), partial(SimpleHTTPRequestHandler, directory=str(root))).serve_forever()
`;
const readme = `# 我的精细 3D 场景

解压整个目录，在该目录运行下列任意一种命令：

    node serve.mjs
    python start.py

然后用现代浏览器打开 http://127.0.0.1:4200/ 。需要本机已有 Node.js 或 Python，且浏览器支持 WebGL 2。运行不安装依赖，不请求模型服务或互联网。浏览器对 file:// 的模块限制使直接双击 index.html 不适用。

## 文件

- index.html / portable-scene.js：独立网页浏览器，保留动态水面与本地环境。
- scene.glb：可在 Blender 或支持 glTF 2.0 的工具中编辑的静态场景快照。
- scene.json：原始布局、模型外观方案、模型编写的精细部件、镜头与真实任务记录。
- inputs/：本次模型读取的布局图与粗模视图；未提供输入视图时不包含该目录。
- delivery-manifest.json：文件 SHA-256、来源对象和 GLB 重新解析检查。
- realistic/：同一版本的渲染器、Three.js、HDR、PBR 材质与扫描模型；全部在项目内。

精细部件由控制模型编写几何参数，通过受约束执行器装配。它不是神经模型生成的任意网格。写实品质需要实际画面验收。
GLB 是静态快照，自定义地形混合、水面着色器、天空和船体动态不以浏览器程序形态保留。具体近似记录于 delivery-manifest.json；网页项目保留运行时呈现。

## 许可证与来源

Three.js：MIT，见 realistic/vendor/LICENSE。版本 0.180.0。
既有摄影材质、HDR 和扫描资产：Poly Haven CC0 1.0，作者、资源页面和许可链接见 realistic/assets/manifest.json。
CC0 完整法律文本：https://creativecommons.org/publicdomain/zero/1.0/legalcode 。
模型任务来源保留在 scene.json 的 receipt / geometryReceipt；本地资源的来源信息不代表它们由模型生成。
`;

export async function buildSceneDelivery({ scene, candidate, onProgress }) {
  if (!scene?.exportSceneSnapshot || !scene?.getFineGeometryChecks) throw new Error('当前场景尚不支持精细项目交付。');
  const plan = validatePlan(candidate?.sourcePlan), recipe = validateCompletionRecipe(candidate.recipe, plan);
  const geometry = validateFineGeometry(candidate.geometry, plan, { baseRecipe: recipe });
  const geometryChecks = scene.getFineGeometryChecks();
  if (!geometryChecks || geometryChecks.sourceFingerprint !== geometry.sourceFingerprint) throw new Error('请先在当前场景中应用对应的精细几何。');
  let snapshot, parsed;
  try {
    publishProgress(onProgress, 'snapshot', '正在整理可编辑场景快照…');
    snapshot = scene.exportSceneSnapshot();
    // The authored plan is the authority: a renderer omission must fail export.
    const requiredIds = plan.entities.map(entity => entity.id);
    const before = inspectGeometryTree(snapshot.scene, requiredIds);
    publishProgress(onProgress, 'sharing', '正在无损复用重复几何，保留全部场景节点…');
    const geometrySharing = await shareIdenticalSnapshotGeometries(snapshot.scene);
    publishProgress(onProgress, 'glb', '正在导出包含网格与材质的 GLB…');
    const rawGLB = await new GLTFExporter().parseAsync(snapshot.scene, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    publishProgress(onProgress, 'repacking', '正在无损复用重复材质图像与缓冲…');
    const repacked = await repackBinaryGLTFLosslessly(rawGLB), glb = repacked.buffer;
    const binary = inspectBinaryGLTF(glb);
    for (const id of requiredIds) if (!binary.sourceIds.includes(id)) throw new Error(`GLB 文件丢失来源标记：${id}`);
    publishProgress(onProgress, 'reload', '正在用独立加载器重新打开 GLB，检查网格与来源…');
    const manager = new LoadingManager();
    manager.setURLModifier(url => {
      if (!/^(?:blob:|data:)/u.test(url)) throw new Error('交付 GLB 不应读取外部文件。');
      return url;
    });
    parsed = await new GLTFLoader(manager).parseAsync(glb, '');
    const reopened = inspectGeometryTree(parsed.scene, requiredIds);
    if (before.triangles !== reopened.triangles) throw new Error('GLB 重新打开后的三角面数量不一致。');
    const checks = { passed: true, binaryHeader: true, embeddedResources: true, independentGLTFReload: true,
      triangleCountPreserved: true, before, reopened, geometry: geometryChecks, geometrySharing, binarySharing: repacked.stats };
    if(candidate.fineEdit){
      const previousGeometry=candidate.geometryIterations?.at(-1)?.geometry;
      if(!previousGeometry)throw new Error('局部精修缺少上一版完整几何，无法检查范围外保持。');
      checks.fineRefinement=assertFineRefinementPreserved(previousGeometry,geometry,plan,candidate.fineEdit.scopeIds,{baseRecipe:recipe});
    }
    publishProgress(onProgress, 'project', '正在打包可独立打开的网页项目与本地资源…');
    const files = await Promise.all([
      ...PORTABLE_RUNTIME_FILES.map(path => localFile(path)),
      localFile('portable-scene.html', 'index.html'), localFile('portable-scene.js'),
    ]);
    const recipeInputs = await actualInputFiles(candidate.views, candidate.receipt, plan, 'inputs/recipe');
    const finalInputs = await actualInputFiles(candidate.geometryViews ?? candidate.views, candidate.geometryReceipt, plan, 'inputs/geometry-final');
    const inputFiles = recipeInputs.files, geometryInputFiles = finalInputs.files, iterations = [], iterationInputChecks = [];
    if (candidate.geometryIterations != null && !Array.isArray(candidate.geometryIterations)) throw new Error('精细几何版次记录无效。');
    for (const [index, iteration] of (candidate.geometryIterations ?? []).entries()) {
      const iterationGeometry = validateFineGeometry(iteration.geometry, plan, { baseRecipe: recipe });
      const archivedInputs = await actualInputFiles(iteration.views, iteration.receipt, plan, `inputs/geometry-iterations/${String(index + 1).padStart(2, '0')}`);
      const iterationInputs = archivedInputs.files; iterationInputChecks.push(archivedInputs.check);
      files.push(...iterationInputs.map(({ path, bytes }) => ({ path, bytes })));
      iterations.push({ geometry: iterationGeometry, receipt: iteration.receipt ?? null,
        views: iterationInputs.map(({ path, label }) => ({ path, label })), checks: iteration.checks ?? null,
        diagnostics: iteration.diagnostics ?? null, fineEdit: iteration.fineEdit ?? null, reason: iteration.reason ?? 'recorded-version' });
    }
    checks.inputProvenance = { recipe: recipeInputs.check, finalGeometry: finalInputs.check, geometryIterations: iterationInputChecks };
    files.push(...[...inputFiles, ...geometryInputFiles].map(({ path, bytes }) => ({ path, bytes })));
    const sceneData = { format: 'tidewater-portable-scene.v1', sourcePlan: plan, recipe, geometry,
      receipt: candidate.receipt ?? null, geometryReceipt: candidate.geometryReceipt ?? null,
      geometryChecks, inputViews: inputFiles.map(({ path, label }) => ({ path, label })),
      geometryViews: geometryInputFiles.map(({ path, label }) => ({ path, label })), geometryIterations: iterations,
      geometryDiagnostics: candidate.geometryDiagnostics ?? null, fineEdit: checks.fineRefinement ?? null, visualQuality: 'needs-review',
      requestIntent: candidate.requestIntent ?? plan.intent,
      viewState: scene.getViewState?.() ?? candidate.viewState ?? null };
    files.push({ path: 'scene.json', bytes: jsonBytes(sceneData) }, { path: 'scene.glb', bytes: new Uint8Array(glb) },
      { path: 'README.md', bytes: encode.encode(readme) }, { path: 'serve.mjs', bytes: encode.encode(launchNode) },
      { path: 'start.py', bytes: encode.encode(launchPython) });
    const fileManifest = await Promise.all(files.map(async file => ({ path: file.path, bytes: file.bytes.length, sha256: await sha256(file.bytes) })));
    const manifest = { format: 'tidewater-scene-delivery.v1', createdAt: new Date().toISOString(),
      title: geometry.title, sourceFingerprint: geometry.sourceFingerprint,
      representation: 'model-authored-component-meshes', neuralImageTo3D: false,
      glbRepresentation: 'static-editable-scene-snapshot',
      runtime: { engine: 'Three.js r180 / WebGL 2', resourcePolicy: 'project-local-only', modelServiceRequired: false,
        remoteRuntimeImports: [], localServerRequired: true, launch: ['node serve.mjs', 'python start.py'] },
      approximations: snapshot.approximations ?? [], checks, files: fileManifest,
      geometryDiagnostics: candidate.geometryDiagnostics ?? null, visualQuality: 'needs-review',
      totalFileBytes: fileManifest.reduce((total, file) => total + file.bytes, 0),
      provenance: { sceneJob: candidate.receipt?.id ?? null, geometryJob: candidate.geometryReceipt?.id ?? null,
        geometryVersionCount: iterations.length + 1, previousGeometryJobs: iterations.map(iteration => iteration.receipt?.id ?? null),
        recipeInputViews: inputFiles.length, finalGeometryInputViews: geometryInputFiles.length },
      licenseFiles: ['realistic/vendor/LICENSE', 'realistic/assets/manifest.json', 'README.md'] };
    files.push({ path: 'delivery-manifest.json', bytes: jsonBytes(manifest) });
    const zip = makeStoredZip(files);
    publishProgress(onProgress, 'ready', 'GLB 重新打开检查通过，网页场景项目已准备好。');
    return { glbBlob: new Blob([glb], { type: 'model/gltf-binary' }), projectBlob: new Blob([zip], { type: 'application/zip' }), manifest, checks };
  } finally {
    if (parsed?.scene) disposeLoaded(parsed.scene);
    snapshot?.dispose?.();
  }
}
