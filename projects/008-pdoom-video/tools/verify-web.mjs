// End-to-end checks for the integrated showcase; this does not validate p5.brush itself.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = resolve(PROJECT, 'notes/web-verification.json');
const ASSETS = resolve(PROJECT, 'assets');
const DESKTOP = { width: 1440, height: 1000, deviceScaleFactor: 1 };
const MOBILE = { width: 375, height: 1000, deviceScaleFactor: 1 };
const delay = ms => new Promise(ok => setTimeout(ok, ms));
const projectPath = path => relative(PROJECT, path).split(sep).join('/');
const hash = value => createHash('sha256').update(value).digest('hex');

function argsFrom(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const equals = arg.indexOf('=');
    if (equals !== -1) args[arg.slice(2, equals)] = arg.slice(equals + 1);
    else args[arg.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  for (const key of Object.keys(args)) {
    if (!['url', 'chrome', 'timeout', 'help'].includes(key)) throw new Error(`Unknown option: --${key}`);
  }
  return args;
}

function findChrome(args) {
  if (args.chrome || process.env.CHROME_PATH) {
    const executable = resolve(String(args.chrome || process.env.CHROME_PATH));
    if (!existsSync(executable)) throw new Error(`Chrome does not exist: ${executable}`);
    return executable;
  }
  const candidates = process.platform === 'win32'
    ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).map(base => resolve(base, 'Google/Chrome/Application/chrome.exe'))
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const executable = candidates.find(existsSync);
  if (!executable) throw new Error('No local Chrome found. Set --chrome=<absolute path> or CHROME_PATH.');
  return executable;
}

function writeReport(report) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

function imageRecord(path) {
  const data = readFileSync(path);
  return { path: projectPath(path), bytes: statSync(path).size, width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/verify-web.mjs [options]
  --url=http://localhost:4191/projects/008-pdoom-video/  Built showcase URL
  --chrome=<absolute path>      Existing Chrome executable
  --timeout=30000              Browser/page timeout in milliseconds
Writes notes/web-verification.json and four PNG screenshots in assets/.
Run after all six frames and the silent 3-second MP4 have been generated and built.`);
    return;
  }
  const url = String(args.url || 'http://localhost:4191/projects/008-pdoom-video/');
  const parsedURL = new URL(url);
  if (!['http:', 'https:'].includes(parsedURL.protocol)) throw new Error('--url must be an HTTP(S) page.');
  const timeout = Number(args.timeout || 30000);
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 180000) throw new Error('--timeout must be between 1000 and 180000 milliseconds.');
  const executablePath = findChrome(args);
  const report = {
    status: 'running', startedAt: new Date().toISOString(), url, chrome: executablePath,
    scope: 'Integrated showcase behavior and rendered-media dimensions. The Canvas principle experiment is a local schematic, not a test of the upstream p5.brush renderer.',
    browser: { headless: true, reducedMotion: 'reduce', desktop: DESKTOP, mobile: MOBILE },
    checks: [], screenshots: [],
    diagnostics: { consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [], httpErrors: [] },
  };
  let browser;
  let page;
  const started = performance.now();
  const check = async (name, fn) => {
    const begin = performance.now();
    try {
      const details = await fn();
      report.checks.push({ name, status: 'passed', durationMs: Math.round(performance.now() - begin), ...(details || {}) });
      writeReport(report);
      console.log(`PASS ${name}`);
    } catch (error) {
      report.checks.push({ name, status: 'failed', durationMs: Math.round(performance.now() - begin), error: error.message });
      throw error;
    }
  };
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, timeout, protocolTimeout: timeout });
    page = await browser.newPage();
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    await page.setViewport(DESKTOP);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    page.on('console', message => {
      if (message.type() === 'error') report.diagnostics.consoleErrors.push(message.text());
      if (message.type() === 'warn') report.diagnostics.consoleWarnings.push(message.text());
    });
    page.on('pageerror', error => report.diagnostics.pageErrors.push(error.message));
    page.on('requestfailed', request => report.diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('response', response => {
      if (response.status() >= 400) report.diagnostics.httpErrors.push({ url: response.url(), status: response.status() });
    });
    const click = selector => page.$eval(selector, element => element.click());
    const text = selector => page.$eval(selector, element => element.textContent.trim());
    const setRange = (selector, value) => page.$eval(selector, (input, newValue) => {
      input.value = String(newValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    const getCanvas = () => page.$eval('#principle-lab canvas', canvas => canvas.toDataURL('image/png'));
    const groupState = selector => page.$$eval(selector, buttons => buttons.map(button => button.getAttribute('aria-pressed')));
    const assertSinglePressed = async (selector, selected) => {
      const pressed = await groupState(selector);
      assert.equal(pressed.filter(value => value === 'true').length, 1, `${selector} must have one selected button`);
      assert.equal(pressed[selected], 'true', `${selector} index ${selected} must be selected`);
    };

    await check('page loads with paused local experiment', async () => {
      const response = await page.goto(url, { waitUntil: 'networkidle0' });
      assert.equal(response?.status(), 200);
      await page.waitForSelector('#principle-lab canvas');
      assert.equal(await page.$eval('.pl-play', element => element.getAttribute('aria-pressed')), 'false');
      assert.equal(await text('.pl-time-output'), '0.00 s');
      const userAgent = await page.evaluate(() => navigator.userAgent);
      report.browser.userAgent = userAgent;
      return { httpStatus: response.status(), title: await page.title(), defaultPlayback: 'paused' };
    });

    await check('six real-scene buttons update loaded 1920 × 1080 frames', async () => {
      const expected = [
        ['t23_80.jpg', '节拍动作'], ['t43_20.jpg', '角色变换'], ['t76_20.jpg', '概念叙事'],
        ['t101_00.jpg', '星球尺度'], ['t112_00.jpg', '场景调度'], ['t143_00.jpg', '返回舞台'],
      ];
      assert.equal(await page.$$eval('[data-scene]', buttons => buttons.length), expected.length);
      const frames = [];
      for (let i = 0; i < expected.length; i += 1) {
        await click(`[data-scene="${i}"]`);
        await page.waitForFunction(() => {
          const image = document.querySelector('#stage-image');
          return image.complete && image.naturalWidth > 0;
        });
        const frame = await page.$eval('#stage-image', image => ({ src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight, hidden: image.hidden, alt: image.alt }));
        assert.equal(new URL(frame.src).pathname.endsWith(`/assets/frames/${expected[i][0]}`), true);
        assert.equal(frame.width, 1920);
        assert.equal(frame.height, 1080);
        assert.equal(frame.hidden, false);
        assert.equal(await text('#scene-title'), expected[i][1]);
        assert.ok((await text('#scene-description')).length > 20);
        assert.ok((await text('#frame-caption')).length > 8);
        await assertSinglePressed('[data-scene]', i);
        frames.push({ file: expected[i][0], title: expected[i][1], width: frame.width, height: frame.height });
      }
      await click('[data-scene="0"]');
      return { frames };
    });

    await check('five pipeline steps update explanation, code and source', async () => {
      const expectedTitles = ['先决定每个镜头发生什么', '给定 t，找到当前章节和镜头', '把形状、姿态与纹理画成一帧', '浏览器逐帧运行同一套代码', '图片序列和音频进入 FFmpeg'];
      assert.equal(await page.$$eval('[data-step]', buttons => buttons.length), 5);
      const steps = [];
      for (let i = 0; i < 5; i += 1) {
        await click(`[data-step="${i}"]`);
        assert.equal(await text('#step-title'), expectedTitles[i]);
        const code = await text('#step-code');
        assert.ok(code.length > 20);
        assert.ok((await text('#step-description')).length > 30);
        const source = await page.$eval('#step-source', element => element.href);
        assert.ok(source.startsWith('https://github.com/JohnHeibel/PDoomVideo/blob/'));
        await assertSinglePressed('[data-step]', i);
        steps.push({ index: i, title: expectedTitles[i], codeLines: code.split('\n').length, source });
      }
      assert.equal(new Set(steps.map(step => step.title)).size, 5);
      return { steps };
    });

    await check('four usage cases update guidance and required work', async () => {
      const expectedTitles = ['让每句歌词都有动作与转场', '让同一角色成为长期内容资产', '把抽象概念变成有时间顺序的画面', '把重复制作变成可配置的模板'];
      assert.equal(await page.$$eval('[data-case]', buttons => buttons.length), 4);
      const cases = [];
      for (let i = 0; i < 4; i += 1) {
        await click(`[data-case="${i}"]`);
        assert.equal(await text('#case-title'), expectedTitles[i]);
        const result = { index: i, title: await text('#case-title') };
        for (const key of ['tag', 'description', 'input', 'reuse', 'work']) {
          result[key] = await text(`#case-${key}`);
          assert.ok(result[key].length > 6, `Usage case ${i} must update ${key}`);
        }
        await assertSinglePressed('[data-case]', i);
        cases.push(result);
      }
      assert.equal(new Set(cases.map(item => item.title)).size, 4);
      assert.equal(new Set(cases.map(item => item.work)).size, 4);
      return { cases };
    });

    await check('five reusable-asset disclosures open, close and link to complete source files', async () => {
      const disclosures = await page.$$('#reuse details');
      assert.equal(disclosures.length, 5, 'The reuse guide must contain five asset categories');
      const vendorPrefix = new URL('vendor/', url).href;
      const records = [];
      const localFiles = new Set();
      for (const [index, disclosure] of disclosures.entries()) {
        const originallyOpen = await disclosure.evaluate(element => element.open);
        if (originallyOpen) await disclosure.$eval('summary', summary => summary.click());
        assert.equal(await disclosure.evaluate(element => element.open), false);
        await disclosure.$eval('summary', summary => summary.click());
        assert.equal(await disclosure.evaluate(element => element.open), true);
        const details = await disclosure.evaluate(element => ({
          summary: element.querySelector('summary')?.textContent.trim(),
          text: element.textContent.trim(),
          links: [...element.querySelectorAll('a')].map(link => ({ label: link.textContent.trim(), href: link.href })),
        }));
        assert.ok(details.summary?.length > 2, `Asset category ${index} needs a meaningful summary`);
        assert.ok(details.text.length > details.summary.length + 25, `Asset category ${index} needs implementation guidance`);
        assert.ok(details.links.length > 0, `Asset category ${index} needs a source-file link`);
        for (const link of details.links) {
          assert.ok(link.label.length > 0, `Asset category ${index} has an unlabeled link`);
          const localVendor = link.href.startsWith(vendorPrefix);
          const pinnedUpstream = /^https:\/\/github\.com\/JohnHeibel\/PDoomVideo\/(?:blob|tree)\/[a-f\d]{40}\/.+/.test(link.href);
          assert.ok(localVendor || pinnedUpstream, `Asset link must point to local vendor or a pinned upstream revision: ${link.href}`);
          if (localVendor) localFiles.add(link.href);
        }
        await disclosure.$eval('summary', summary => summary.click());
        assert.equal(await disclosure.evaluate(element => element.open), false);
        if (originallyOpen) await disclosure.$eval('summary', summary => summary.click());
        records.push({ index, summary: details.summary, links: details.links, toggledOpenAndClosed: true });
      }
      assert.equal(new Set(records.map(record => record.summary)).size, 5, 'All five reusable-asset categories must be distinct');
      const localResponses = await page.evaluate(async addresses => Promise.all(addresses.map(async address => {
        const response = await fetch(address);
        const content = await response.text();
        return { url: address, status: response.status, characters: content.length };
      })), [...localFiles]);
      for (const response of localResponses) {
        assert.equal(response.status, 200, `Reusable source file is unavailable: ${response.url}`);
        assert.ok(response.characters > 0, `Reusable source file is empty: ${response.url}`);
      }
      return { categories: records, checkedLocalFiles: localResponses, externalLinks: 'Pinned URL validation only; no external network request.' };
    });

    await check('render budget uses measured frame times and labels ideal parallel estimates', async () => {
      await page.waitForFunction(() => document.querySelector('#render-budget')?.dataset.ready === 'true');
      const benchmarkURL = new URL('assets/render-benchmark.json', url).href;
      const benchmark = await page.evaluate(async address => {
        const response = await fetch(address);
        if (!response.ok) throw new Error(`Benchmark data returned HTTP ${response.status}`);
        return response.json();
      }, benchmarkURL);
      assert.ok(Number.isFinite(benchmark.stills?.minMs) && benchmark.stills.minMs > 0, 'Measured minimum frame time must be positive');
      assert.ok(Number.isFinite(benchmark.stills?.maxMs) && benchmark.stills.maxMs >= benchmark.stills.minMs, 'Measured maximum frame time must follow the minimum');
      const durationControl = await page.$eval('#budget-duration', input => ({ value: input.value, min: input.min, max: input.max, type: input.type }));
      assert.deepEqual(durationControl, { value: '15', min: '3', max: '60', type: 'range' });
      assert.equal(await page.$eval('#budget-fps', select => select.value), '24');
      assert.equal(await page.$eval('#budget-workers', select => select.value), '1');
      const readBudget = () => page.evaluate(() => {
        const readInterval = selector => {
          const output = document.querySelector(selector);
          return { text: output.textContent.trim(), minSeconds: Number(output.dataset.minSeconds), maxSeconds: Number(output.dataset.maxSeconds) };
        };
        return {
          frames: Number(document.querySelector('#budget-frames').textContent.replaceAll(',', '').trim()),
          serial: readInterval('#budget-serial'), ideal: readInterval('#budget-ideal'),
        };
      });
      const closeTo = (actual, expected, label) => {
        assert.ok(Number.isFinite(actual), `${label} must be finite`);
        assert.ok(Math.abs(actual - expected) <= 0.02, `${label}: expected ${expected}, got ${actual}`);
      };
      const assertBudget = async (frames, workers) => {
        await page.waitForFunction(expected => Number(document.querySelector('#budget-frames').textContent.replaceAll(',', '').trim()) === expected, {}, frames);
        const values = await readBudget();
        assert.equal(values.frames, frames);
        assert.ok(Number.isInteger(values.frames));
        const serialMin = frames * benchmark.stills.minMs / 1000;
        const serialMax = frames * benchmark.stills.maxMs / 1000;
        closeTo(values.serial.minSeconds, serialMin, 'Serial minimum seconds');
        closeTo(values.serial.maxSeconds, serialMax, 'Serial maximum seconds');
        closeTo(values.ideal.minSeconds, serialMin / workers, 'Ideal parallel minimum seconds');
        closeTo(values.ideal.maxSeconds, serialMax / workers, 'Ideal parallel maximum seconds');
        for (const interval of [values.serial, values.ideal]) {
          assert.match(interval.text, /分钟|min/i, 'Budget should display a readable minute interval');
          assert.doesNotMatch(interval.text, /NaN|Infinity|undefined/);
        }
        return values;
      };
      const defaults = await assertBudget(360, 1);
      await setRange('#budget-duration', 30);
      await page.select('#budget-fps', '12');
      const sameFrameCount = await assertBudget(360, 1);
      closeTo(sameFrameCount.serial.minSeconds, defaults.serial.minSeconds, 'Equal frame counts retain serial minimum');
      closeTo(sameFrameCount.serial.maxSeconds, defaults.serial.maxSeconds, 'Equal frame counts retain serial maximum');
      await page.select('#budget-fps', '24');
      const doubled = await assertBudget(720, 1);
      await page.select('#budget-workers', '4');
      const idealFourWorkers = await assertBudget(720, 4);
      closeTo(idealFourWorkers.serial.minSeconds, doubled.serial.minSeconds, 'Workers retain serial minimum');
      closeTo(idealFourWorkers.serial.maxSeconds, doubled.serial.maxSeconds, 'Workers retain serial maximum');
      assert.match(await text('#render-budget'), /未实测/, 'Ideal parallel performance must be identified as unmeasured');
      await setRange('#budget-duration', 15);
      await page.select('#budget-fps', '24');
      await page.select('#budget-workers', '1');
      await assertBudget(360, 1);
      return {
        benchmarkURL, measuredFrameTimeMs: { min: benchmark.stills.minMs, max: benchmark.stills.maxMs },
        defaults, duration30Fps12: sameFrameCount, duration30Fps24: doubled, duration30Fps24Workers4: idealFourWorkers,
        idealParallelClearlyUnmeasured: true, numericalToleranceSeconds: 0.02,
      };
    });

    await check('Canvas time, BPM, modes and layers alter the local schematic', async () => {
      await setRange('.pl-time-input', 1.72);
      assert.equal(await text('.pl-time-output'), '1.72 s');
      assert.equal(await text('.pl-value-beat'), (1.72 * 88 / 60).toFixed(2));
      assert.equal(await text('.pl-value-seed'), '20');
      const baseline = await getCanvas();
      await setRange('.pl-bpm-input', 120);
      assert.equal(await text('.pl-bpm-output'), '120 BPM');
      assert.equal(await text('.pl-value-beat'), '3.44');
      assert.notEqual(await getCanvas(), baseline);
      await setRange('.pl-bpm-input', 88);
      assert.equal(await getCanvas(), baseline);
      const modes = [];
      for (const mode of ['jump', 'sway', 'wipe']) {
        await click(`.pl-modes input[value="${mode}"]`);
        const result = { mode, canvasSHA256: hash(await getCanvas()), formula: await text('.pl-code-motion') };
        assert.equal(await page.$eval(`.pl-modes input[value="${mode}"]`, input => input.checked), true);
        modes.push(result);
      }
      assert.equal(new Set(modes.map(mode => mode.canvasSHA256)).size, 3);
      await click('.pl-modes input[value="jump"]');
      const layers = [];
      for (const layer of ['character', 'camera', 'jitter']) {
        await click(`.pl-layers input[value="${layer}"]`);
        assert.equal(await page.$eval(`.pl-layers input[value="${layer}"]`, input => input.checked), false);
        const changed = await getCanvas();
        assert.notEqual(changed, baseline, `${layer} layer must change the drawing`);
        layers.push({ layer, disabledSHA256: hash(changed) });
        await click(`.pl-layers input[value="${layer}"]`);
        assert.equal(await getCanvas(), baseline);
      }
      return { time: 1.72, bpm: 88, beat: 2.52, seed: 20, modes, layers };
    });

    await check('Canvas redraw and reverse seek preserve identical pixels', async () => {
      const original = await getCanvas();
      await click('.pl-redraw');
      const redrawn = await getCanvas();
      assert.equal(redrawn, original);
      await setRange('.pl-time-input', 5.5);
      assert.notEqual(await getCanvas(), original);
      await setRange('.pl-time-input', 1.72);
      const returned = await getCanvas();
      assert.equal(returned, original);
      return { time: 1.72, bpm: 88, mode: 'jump', comparison: 'strict equality of complete PNG data URLs', originalSHA256: hash(original), redrawnSHA256: hash(redrawn), reverseSeekSHA256: hash(returned) };
    });

    await check('Canvas playback advances time and pause freezes it', async () => {
      const before = Number(await page.$eval('.pl-time-input', input => input.value));
      await click('.pl-play');
      assert.equal(await page.$eval('.pl-play', button => button.getAttribute('aria-pressed')), 'true');
      await delay(320);
      await click('.pl-play');
      assert.equal(await page.$eval('.pl-play', button => button.getAttribute('aria-pressed')), 'false');
      const after = Number(await page.$eval('.pl-time-input', input => input.value));
      assert.ok(after > before, 'Playback must advance the timeline');
      const frozen = await getCanvas();
      await delay(160);
      assert.equal(Number(await page.$eval('.pl-time-input', input => input.value)), after);
      assert.equal(await getCanvas(), frozen);
      await page.focus('.pl-time-input');
      await page.keyboard.press('ArrowRight');
      const keyboardTime = Number(await page.$eval('.pl-time-input', input => input.value));
      assert.ok(keyboardTime > after, 'Native keyboard range interaction must advance time');
      return { before, after, pauseStableForMs: 160, keyboardTime };
    });

    await check('silent 3-second video plays at 1920 × 1080 and returns to still', async () => {
      await page.click('#clip-button');
      await page.waitForFunction(() => {
        const video = document.querySelector('#stage-video');
        return !video.hidden && video.videoWidth > 0 && Number.isFinite(video.duration) && !video.paused;
      });
      const start = await page.$eval('#stage-video', video => ({ width: video.videoWidth, height: video.videoHeight, duration: video.duration, currentTime: video.currentTime, muted: video.muted, loop: video.loop, src: video.currentSrc }));
      assert.equal(start.width, 1920);
      assert.equal(start.height, 1080);
      assert.ok(Math.abs(start.duration - 3) < 0.08, `Expected a 3-second clip, got ${start.duration}`);
      assert.equal(start.muted, true);
      assert.equal(start.loop, true);
      assert.equal(await page.$eval('#stage-image', image => image.hidden), true);
      await delay(350);
      const firstTime = await page.$eval('#stage-video', video => video.currentTime);
      assert.ok(firstTime > start.currentTime + 0.15, 'Video frames must actually advance');
      await delay(3050);
      assert.equal(await page.$eval('#stage-video', video => video.paused), false);
      const loopTime = await page.$eval('#stage-video', video => video.currentTime);
      assert.ok(loopTime >= 0 && loopTime < 3.08);
      await page.click('#clip-button');
      assert.equal(await page.$eval('#stage-video', video => video.hidden && video.paused), true);
      assert.equal(await page.$eval('#stage-image', image => !image.hidden && image.complete && image.naturalWidth === 1920), true);
      assert.equal(await text('#media-tag'), '静帧 / 1920 × 1080');
      return { ...start, firstTime, loopTime, watchedForMs: 3400, returnedToStill: true };
    });

    await check('desktop and mobile screenshots with no horizontal overflow', async () => {
      mkdirSync(ASSETS, { recursive: true });
      await click('[data-scene="0"]');
      await click('[data-step="2"]');
      await click('[data-case="0"]');
      await click('.pl-modes input[value="jump"]');
      await setRange('.pl-bpm-input', 88);
      await setRange('.pl-time-input', 1.52);
      await page.evaluate(() => document.activeElement?.blur());
      const sizes = [];
      for (const [name, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
        await page.setViewport(viewport);
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
        await delay(80);
        const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
        if (dimensions.scrollWidth > dimensions.width) {
          const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => {
            const box = element.getBoundingClientRect();
            return box.left < -1 || box.right > innerWidth + 1;
          }).slice(0, 12).map(element => `${element.tagName.toLowerCase()}.${element.className}`));
          assert.fail(`${name} has horizontal overflow (${dimensions.scrollWidth}/${dimensions.width}): ${overflow.join(', ')}`);
        }
        const fullPath = resolve(ASSETS, `lab-page-${name}.png`);
        await page.screenshot({ path: fullPath, fullPage: true });
        report.screenshots.push(imageRecord(fullPath));
        const clip = await page.$eval('#principles', element => {
          const box = element.getBoundingClientRect();
          return { x: Math.max(0, box.left + scrollX), y: Math.max(0, box.top + scrollY), width: box.width, height: box.height };
        });
        const principlesPath = resolve(ASSETS, `lab-principles-${name}.png`);
        await page.screenshot({ path: principlesPath, clip, captureBeyondViewport: true });
        report.screenshots.push(imageRecord(principlesPath));
        sizes.push({ name, ...dimensions, horizontalOverflow: false });
      }
      return { viewports: sizes, files: report.screenshots.map(screenshot => screenshot.path) };
    });

    await check('no browser errors, failed requests or HTTP resource errors', async () => {
      await delay(100);
      for (const [name, values] of Object.entries(report.diagnostics)) assert.deepEqual(values, [], `${name}: ${JSON.stringify(values)}`);
      return { consoleErrors: 0, consoleWarnings: 0, pageErrors: 0, failedRequests: 0, httpErrors: 0 };
    });
    report.status = 'passed';
    report.finishedAt = new Date().toISOString();
    report.totalMs = Math.round(performance.now() - started);
    writeReport(report);
    console.log(`Passed ${report.checks.length} checks. Report: ${projectPath(REPORT_PATH)}`);
  } catch (error) {
    report.status = 'failed';
    report.finishedAt = new Date().toISOString();
    report.totalMs = Math.round(performance.now() - started);
    report.error = error.message;
    writeReport(report);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
