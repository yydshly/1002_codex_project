import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch { puppeteer = require('../../../projects/008-pdoom-video/tools/node_modules/puppeteer-core'); }
const project = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:4196';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--no-first-run', '--no-default-browser-check', '--enable-unsafe-webgpu'], protocolTimeout: 60000 });
const page = await browser.newPage(), checks = [], errors = [], missing = [];
const check = (name, pass) => { checks.push({ name, pass: !!pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); if (!pass) throw new Error(name); };
page.on('pageerror', error => { errors.push(error.message); console.log('PAGEERROR', error.message); });
page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.log('CONSOLE', message.text()); } });
page.on('response', response => { if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`); });
const getPlan = () => page.evaluate(() => creationStudio.plan);
const boardPoint = async (x, y) => page.$eval('#layout-canvas', (canvas, point) => { const rect = canvas.getBoundingClientRect(); return { x: rect.left + point.x * rect.width, y: rect.top + point.y * rect.height }; }, { x, y });
async function draw(kind, points) {
  await page.click(`[data-tool="${kind}"]`); await page.$eval('#layout-canvas', element => element.scrollIntoView({ block: 'center' })); const screen = await Promise.all(points.map(point => boardPoint(point[0], point[1])));
  await page.mouse.move(screen[0].x, screen[0].y); await page.mouse.down();
  for (const point of screen.slice(1)) await page.mouse.move(point.x, point.y, { steps: 5 });
  await page.mouse.up();
}
async function place(kind, x, y) { await page.click(`[data-tool="${kind}"]`); await page.$eval('#layout-canvas', element => element.scrollIntoView({ block: 'center' })); const point = await boardPoint(x, y); await page.mouse.click(point.x, point.y); }
const settled = async () => page.waitForFunction(() => { const preview = document.getElementById('creation-frame').contentWindow.creationPreview; return preview?.ready && preview.plan && preview.stats.entities === creationStudio.plan.entities.length && !preview.stats.inFlight && preview.stats.rendered > 0; }, { timeout: 30000 });
async function editNumber(id, value) { await page.$eval(`#${id}`, (input, value) => { input.value = String(value); input.dispatchEvent(new Event('change', { bubbles: true })); }, value); }
try {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/create.html?entry=layout`, { waitUntil: 'networkidle0' }); await page.waitForFunction(() => creationStudio.ready);
  check('绘笔入口初始为空方案，没有注入模板', (await getPlan()).entities.length === 0 && await page.$eval('[data-entry="layout"]', element => element.getAttribute('aria-pressed') === 'true'));
  const original = await page.evaluate(async () => { const { createScene } = await import('./scene-core.js'); const value = JSON.stringify(createScene('sunset')); localStorage.setItem('tidewater-studio.v1', value); return value; });
  await page.reload({ waitUntil: 'networkidle0' }); await page.waitForFunction(() => creationStudio.ready);
  check('原海岛配置已独立备份且保持原值', await page.evaluate(value => localStorage.getItem('tidewater-studio.v1') === value && localStorage.getItem('tidewater-studio.before-creation-inputs') === value, original));
  await draw('land', [[.12, .25], [.42, .25], [.42, .73], [.12, .73], [.12, .25]]);
  check('真实绘笔事件建立闭合陆地区域', (await getPlan()).entities.length === 1 && (await getPlan()).entities[0].kind === 'land');
  await draw('road', [[.2, .55], [.6, .55], [.75, .65]]);
  await place('lighthouse', .27, .4); await place('cabin', .33, .6);
  let plan = await getPlan(); const tower = plan.entities.find(entity => entity.kind === 'lighthouse').id, cabin = plan.entities.find(entity => entity.kind === 'cabin').id;
  check('道路与标记生成独立稳定对象', plan.entities.length === 4 && new Set(plan.entities.map(entity => entity.id)).size === 4);
  await page.click('#generate-preview'); await page.waitForFunction(() => creationStudio.previewReady); await settled();
  check('布局生成真实 GPU 三角形粗模', await page.evaluate(() => { const preview = document.getElementById('creation-frame').contentWindow.creationPreview; return preview.stats.renderer === 'WebGPU' && preview.stats.triangles > 100 && preview.stats.bufferBytes > 10000; }));
  await page.click(`[data-entity-id="${tower}"]`); const before = await page.evaluate(id => document.getElementById('creation-frame').contentWindow.creationPreview.getEntityBounds(id), tower);
  await editNumber('entity-x', -25); await editNumber('entity-height', 30); await settled();
  await page.waitForFunction(id => document.getElementById('creation-frame').contentWindow.creationPreview.getEntityBounds(id).max[1] > 30, {}, tower);
  check('位置和高度改变真实灯塔几何', await page.evaluate(({ id, before }) => { const bounds = document.getElementById('creation-frame').contentWindow.creationPreview.getEntityBounds(id); return Math.abs((bounds.min[0] + bounds.max[0]) / 2 + 25) < .01 && bounds.max[1] - bounds.min[1] > before.max[1] - before.min[1] + 10; }, { id: tower, before }));
  await page.click('#entity-locked');
  check('锁定拒绝变换和删除', await page.evaluate(id => { const snapshot = JSON.stringify(creationStudio.plan); let rejected = false; try { creationStudio.execute([{ type: 'remove', id }]); } catch { rejected = true; } return rejected && document.getElementById('entity-x').disabled && snapshot === JSON.stringify(creationStudio.plan); }, tower));
  const locked = await getPlan(); await page.click('#clear-layout');
  check('清除未锁定保留已确认灯塔', (await getPlan()).entities.length === 1 && (await getPlan()).entities[0].id === tower);
  await page.click('#undo-plan'); check('撤销恢复完整布局', JSON.stringify(await getPlan()) === JSON.stringify(locked));
  await page.click('#redo-plan'); check('重做恢复清除结果', (await getPlan()).entities.length === 1); await page.click('#undo-plan'); await settled();
  await page.click(`[data-entity-id="${cabin}"]`); await page.click('[data-tool="select"]');
  const oldCabin = (await getPlan()).entities.find(entity => entity.id === cabin), start = await boardPoint(oldCabin.points[0].x, oldCabin.points[0].y), end = await boardPoint(oldCabin.points[0].x + .08, oldCabin.points[0].y - .06);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up(); await settled();
  check('画布拖动只移动选中对象', await page.evaluate(({ cabin, tower, locked }) => { const plan = creationStudio.plan; return plan.entities.find(entity => entity.id === cabin).points[0].x > .4 && JSON.stringify(plan.entities.find(entity => entity.id === tower)) === JSON.stringify(locked.entities.find(entity => entity.id === tower)); }, { cabin, tower, locked }));
  await page.click('[data-preview-camera="top"]'); await page.waitForFunction(() => document.getElementById('creation-frame').contentWindow.creationPreview.cameraPreset === 'top');
  const hit = await page.evaluate(id => { const frame = document.getElementById('creation-frame'), rect = frame.getBoundingClientRect(), point = frame.contentWindow.creationPreview.projectEntity(id); return { x: rect.x + point.x, y: rect.y + point.y }; }, tower);
  await page.mouse.click(hit.x, hit.y); await page.waitForFunction(id => creationStudio.selectedId === id, {}, tower);
  check('3D 几何拾取联动对象属性', await page.$eval('#selection-heading', element => element.textContent.includes('灯塔')));
  await page.click('[data-preview-camera="overview"]'); await settled();
  await page.screenshot({ path: path.join(project, 'assets/creation-workbench-layout.png'), fullPage: true });
  await page.click('[data-entry="image"]');
  check('参考图片入口切换保留布局', (await getPlan()).entry === 'image' && (await getPlan()).entities.length === 4);
  await (await page.$('#reference-file')).uploadFile(path.join(project, 'assets/workbench-sunset.png'));
  await page.waitForFunction(() => creationStudio.plan.reference !== null);
  check('真实图片上传解码并嵌入方案', await page.evaluate(() => creationStudio.plan.reference.width > 0 && creationStudio.plan.reference.dataUrl.startsWith('data:image/jpeg;base64,')));
  await page.$eval('#plan-intent', element => { element.value = '保留白色灯塔和暖色屋顶，校正布局后生成'; element.dispatchEvent(new Event('change', { bubbles: true })); });
  await place('boat', .68, .77); await settled();
  check('人工图片标注增加粗模对象并保留锁定内容', await page.evaluate(({ tower, locked }) => creationStudio.plan.entities.some(entity => entity.kind === 'boat') && JSON.stringify(creationStudio.plan.entities.find(entity => entity.id === tower)) === JSON.stringify(locked.entities.find(entity => entity.id === tower)), { tower, locked }));
  const referenceCanvas = await page.$eval('#layout-canvas', element => element.toDataURL());
  await page.click('#view-layout'); const layoutCanvas = await page.$eval('#layout-canvas', element => element.toDataURL());
  check('图片对照与俯视布局可切换，画布实际变化', referenceCanvas !== layoutCanvas);
  await page.click('#view-reference');
  await page.click('#show-brief');
  check('生成说明包含布局、图片与外观意图', await page.$eval('#brief-text', element => element.value.includes('保留白色灯塔') && element.value.includes('灯塔') && element.value.includes('参考'))); await page.click('#close-brief');
  await page.click('#save-plan'); await page.waitForFunction(() => document.getElementById('project-status').textContent.includes('已保存'));
  const saved = await getPlan(); await page.reload({ waitUntil: 'networkidle0' }); await page.waitForFunction(() => creationStudio.ready);
  check('IndexedDB 恢复图片、布局、意图与锁定', JSON.stringify(await getPlan()) === JSON.stringify(saved));
  check('创作保存没有覆盖原海岛存档', await page.evaluate(value => localStorage.getItem('tidewater-studio.v1') === value, original));
  await page.click('#generate-preview'); await page.waitForFunction(() => creationStudio.previewReady); await settled();
  await page.screenshot({ path: path.join(project, 'assets/creation-workbench-reference.png'), fullPage: true });
  const downloadDir = path.join(project, '.runtime', 'creation-downloads', String(Date.now())); await mkdir(downloadDir, { recursive: true });
  const cdp = await browser.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  await page.click('#export-plan'); let exported;
  for (let i = 0; i < 100 && !exported; i++) { exported = (await readdir(downloadDir)).find(name => name.endsWith('.creation.json')); if (!exported) await new Promise(resolve => setTimeout(resolve, 50)); }
  check('实际导出完整 JSON 文件', exported && JSON.stringify(JSON.parse(await readFile(path.join(downloadDir, exported), 'utf8'))) === JSON.stringify(saved));
  await writeFile(path.join(downloadDir, 'valid.json'), JSON.stringify({ ...saved, name: '导入后的参考场景' }));
  await (await page.$('#plan-file')).uploadFile(path.join(downloadDir, 'valid.json')); await page.waitForFunction(() => creationStudio.plan.name === '导入后的参考场景');
  check('导入完整图片方案可继续编辑', (await getPlan()).reference.dataUrl === saved.reference.dataUrl);
  const beforeInvalid = JSON.stringify(await getPlan()); await writeFile(path.join(downloadDir, 'invalid.json'), JSON.stringify({ ...saved, version: 999 }));
  await (await page.$('#plan-file')).uploadFile(path.join(downloadDir, 'invalid.json')); await page.waitForFunction(() => document.getElementById('creation-toast').textContent.includes('导入失败'));
  check('无效导入保留当前方案', JSON.stringify(await getPlan()) === beforeInvalid);
  await page.click('#undo-plan'); check('导入可撤销', JSON.stringify(await getPlan()) === JSON.stringify(saved));
  await page.click('[data-entry="layout"]'); await page.click('#load-demo'); await settled();
  check('显式载入不同布局改变实际几何', await page.evaluate(() => { const preview = document.getElementById('creation-frame').contentWindow.creationPreview; return creationStudio.plan.entities.length === 9 && preview.stats.entities === 9 && preview.stats.triangles > 300; }));
  await page.screenshot({ path: path.join(project, 'assets/creation-workbench-demo.png'), fullPage: true });
  await page.click('#auto-preview'); const beforeManual = await page.evaluate(() => document.getElementById('creation-frame').contentWindow.creationPreview.stats.generation);
  await place('cabin', .52, .2);
  check('手动更新模式新增对象不破坏旧预览', await page.evaluate(before => creationStudio.previewReady && creationStudio.plan.entities.length === 10 && document.getElementById('creation-frame').contentWindow.creationPreview.stats.generation === before && document.getElementById('preview-state').textContent === '布局已修改', beforeManual));
  await page.click('#generate-preview'); await settled();
  check('手动更新把新对象加入真实粗模', await page.evaluate(() => document.getElementById('creation-frame').contentWindow.creationPreview.stats.entities === 10));
  await page.click('#undo-plan'); await page.click('#auto-preview'); await settled();
  for (const width of [1440, 1024, 768, 390, 320]) { await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 }); check(`创作页面 ${width}px 无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 }); await page.screenshot({ path: path.join(project, 'assets/creation-workbench-mobile.png'), fullPage: true });
  check('导入非法区域操作不会部分修改布局', await page.evaluate(() => { const before = JSON.stringify(creationStudio.plan); try { creationStudio.execute([{ type: 'style', values: { lighting: 'sunset' } }, { type: 'add', entity: { id: 'invalid-cross', kind: 'land', points: [{ x: .1, y: .1 }, { x: .8, y: .8 }, { x: .1, y: .8 }, { x: .8, y: .1 }] } }]); } catch {} return before === JSON.stringify(creationStudio.plan); }));
  const baselineDir = path.join(project, 'versions/2026-10-04-before-creation-inputs'), manifest = JSON.parse((await readFile(path.join(baselineDir, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
  let baselineValid = true;
  for (const file of manifest.files) if (createHash('sha256').update(await readFile(path.join(baselineDir, file.path))).digest('hex') !== file.sha256) baselineValid = false;
  check('保存的旧版源码与截图哈希完整', baselineValid && manifest.files.length === 14);
  await page.setRequestInterception(true);
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/runtime/index.html')) request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>旧版导航检查，跳过完整GPU初始化</title>' }); else request.continue(); });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 }); await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
    check(`原工作台新增入口 ${width}px 无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  check('原工作台有两个实验入口及保留版本', await page.evaluate(() => ['create.html?entry=image', 'create.html?entry=layout', 'previous/index.html'].every(href => document.querySelector(`a[href="${href}"]`))));
  await page.goto(`${origin}/previous/`, { waitUntil: 'networkidle0' });
  check('旧版页面可打开且保持原六对象编辑', await page.evaluate(() => window.studio?.scene.objects.length === 6 && document.getElementById('world-frame').getAttribute('src').startsWith('../runtime/')));
  check('页面无异常或缺失资源', !errors.length && !missing.length);
} catch (error) {
  await page.screenshot({ path: path.join(project, 'assets/creation-browser-failure.png'), fullPage: true }).catch(() => {});
  console.error(error); process.exitCode = 1;
} finally {
  await writeFile(path.join(project, 'checks/creation-browser-results.json'), JSON.stringify({ date: new Date().toISOString(), scope: '参考图片与绘笔布局端到端、真实轻量WebGPU粗模；旧原生海岛仅检查页面/入口与配置，未重复完整海洋渲染测试', renderer: 'Chrome WebGPU', checks, errors, missing }, null, 2));
  await browser.close();
}
