// Render evidence from the upstream P(doom) drawing code; never fetch or mix its song.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(PROJECT, 'web/source-studio.html');
const RESULTS = resolve(PROJECT, 'notes/render-results.json');
const WIDTH = 1920, HEIGHT = 1080, DURATION = 156.6;
const DEFAULT_TIMES = [23.8, 43.2, 76.2, 101, 112, 143];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const equal = arg.indexOf('=');
    if (equal !== -1) args[arg.slice(2, equal)] = arg.slice(equal + 1);
    else {
      const key = arg.slice(2);
      args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  const known = new Set(['help', 'chrome', 'ffmpeg', 'angle', 'out', 'stills', 'clip', 'fps', 'cols', 'w', 'timeout', 'allow-software']);
  for (const key of Object.keys(args)) if (!known.has(key)) throw new Error(`Unknown option: --${key}`);
  return args;
}

function insideProject(value) {
  const path = resolve(PROJECT, value);
  const rel = relative(PROJECT, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Output must stay inside this project: ${path}`);
  return path;
}

const projectPath = path => relative(PROJECT, path).split(sep).join('/');
function saveJSON(data) {
  mkdirSync(dirname(RESULTS), { recursive: true });
  writeFileSync(RESULTS, JSON.stringify(data, null, 2) + '\n');
}
function saveURL(path, url) {
  if (!/^data:image\/(png|jpeg);base64,/.test(url)) throw new Error('Renderer returned an unexpected image payload');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  return statSync(path).size;
}
function finiteNumber(value, name, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return n;
}
function chromePath(args) {
  if (args.chrome || process.env.CHROME_PATH) {
    const path = resolve(String(args.chrome || process.env.CHROME_PATH));
    if (!existsSync(path)) throw new Error(`Chrome does not exist: ${path}`);
    return path;
  }
  const candidates = process.platform === 'win32'
    ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean).map(base => resolve(base, 'Google/Chrome/Application/chrome.exe'))
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const path = candidates.find(existsSync);
  if (!path) throw new Error('No local Chrome found. Set --chrome=<absolute path> or CHROME_PATH.');
  return path;
}

function encoder(executable, output, fps, count) {
  const options = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-an', '-frames:v', String(count), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output];
  const child = spawn(executable, options, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let ended = false, details = '';
  child.stderr.on('data', chunk => { details = (details + String(chunk)).slice(-12000); });
  child.stdin.on('error', () => {}); // Errors are reported by write() or the final process result.
  const result = new Promise(resolveResult => {
    child.once('error', error => { ended = true; resolveResult({ code: null, error: error.message }); });
    child.once('close', (code, signal) => { ended = true; resolveResult({ code, signal, stderr: details }); });
  });
  return {
    args: options,
    async write(buffer) {
      if (ended || child.stdin.destroyed) {
        const status = await result;
        throw new Error(`FFmpeg stopped: ${status.error || status.stderr || status.code}`);
      }
      if (!child.stdin.write(buffer)) {
        await new Promise((ok, fail) => {
          const cleanup = () => { child.stdin.off('drain', drain); child.stdin.off('error', error); child.off('close', close); };
          const drain = () => { cleanup(); ok(); };
          const error = e => { cleanup(); fail(e); };
          const close = code => { cleanup(); fail(new Error(`FFmpeg exited during frame input (${code}): ${details}`)); };
          child.stdin.once('drain', drain); child.stdin.once('error', error); child.once('close', close);
        });
      }
    },
    async finish() {
      child.stdin.end();
      const status = await result;
      if (status.code !== 0) throw new Error(`FFmpeg failed: ${status.error || status.stderr || `exit ${status.code}`}`);
      if (!existsSync(output) || statSync(output).size === 0) throw new Error('FFmpeg exited successfully but produced no video');
      return { exitCode: status.code, bytes: statSync(output).size };
    },
    abort() { child.stdin.destroy(); if (!ended) child.kill(); }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/render-evidence.mjs [options]
  --stills=23.8,43.2,76.2,101,112,143  Render these original 1080p frames (default)
  --stills=none                Skip stills/contact sheet, useful with --clip
  --clip=23:26                 Also render this silent MP4, no song required
  --fps=12                    Clip frame rate (default 12)
  --out=web/assets            Output directory inside this subproject
  --cols=3 --w=640            Contact sheet columns and thumbnail width
  --chrome=<absolute path>    Use an existing local Chrome
  --ffmpeg=<path or command>  FFmpeg executable (default ffmpeg)
  --angle=d3d11               Chrome ANGLE backend (default on Windows)
  --allow-software            Permit and explicitly record software rendering
  --timeout=120000            Page initialization timeout in milliseconds`);
    return;
  }
  const out = insideProject(String(args.out || 'web/assets'));
  const fps = finiteNumber(args.fps ?? 12, '--fps', 1, 60);
  const cols = finiteNumber(args.cols ?? 3, '--cols', 1, 12);
  const thumbWidth = finiteNumber(args.w ?? 640, '--w', 160, 1920);
  const timeout = finiteNumber(args.timeout ?? 120000, '--timeout', 1000, 600000);
  if (!Number.isInteger(cols) || !Number.isInteger(thumbWidth)) throw new Error('--cols and --w must be integers');
  const stillTimes = args.stills === 'none' ? [] : args.stills === undefined ? DEFAULT_TIMES : String(args.stills).split(',').map(t => finiteNumber(t, '--stills time', 0, DURATION));
  let clipRange = null;
  if (args.clip) {
    const parts = String(args.clip).split(':');
    if (parts.length !== 2) throw new Error('--clip must be start:end, for example --clip=23:26');
    clipRange = parts.map(t => finiteNumber(t, '--clip time', 0, DURATION));
    if (clipRange[1] <= clipRange[0]) throw new Error('--clip end must follow its start');
  }
  if (!stillTimes.length && !clipRange) throw new Error('Choose at least one still time or a --clip range');
  if (!existsSync(SOURCE)) throw new Error(`Source studio is not ready: ${SOURCE}`);
  const executablePath = chromePath(args);
  mkdirSync(out, { recursive: true });
  const previous = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : {};
  const report = { ...previous, sourceStudio: projectPath(SOURCE), resolution: { width: WIDTH, height: HEIGHT },
    lastRun: { startedAt: new Date().toISOString(), status: 'running', command: process.argv.slice(2), chrome: executablePath } };
  let browser, activeEncoder;
  try {
    const flags = ['--allow-file-access-from-files', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--window-size=1920,1080', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
    const angle = args.angle || (process.platform === 'win32' ? 'd3d11' : null);
    if (angle) flags.push(`--use-angle=${angle}`);
    browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: 0, args: flags });
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('pageerror', error => { pageErrors.push(error.message); console.error(`[page] ${error.message}`); });
    page.on('console', message => { if (['error', 'warn'].includes(message.type())) console.error(`[page ${message.type()}] ${message.text()}`); });
    await page.goto(pathToFileURL(SOURCE).href + '?render', { waitUntil: 'networkidle0', timeout });
    await page.waitForFunction('window.ready === true && typeof window.renderAt === "function"', { timeout });
    report.gpu = await page.evaluate(() => ({ renderer: typeof window.gpuInfo === 'function' ? window.gpuInfo() : null,
      userAgent: navigator.userAgent, canvasWidth: document.getElementById('out')?.width, canvasHeight: document.getElementById('out')?.height }));
    report.gpu.software = /swiftshader|llvmpipe|software|microsoft basic render/i.test(report.gpu.renderer || '');
    report.gpu.recordedAt = new Date().toISOString();
    console.log('GPU:', report.gpu.renderer);
    if (!report.gpu.renderer) throw new Error('The upstream studio did not report its WebGL renderer');
    if (report.gpu.canvasWidth !== WIDTH || report.gpu.canvasHeight !== HEIGHT) throw new Error('Source studio does not have the expected 1920×1080 canvas');
    if (report.gpu.software && !args['allow-software']) throw new Error('Chrome uses a software GPU. Retry with a working hardware backend, or explicitly use --allow-software.');
    saveJSON(report);
    const renderAt = async t => page.evaluate(async time => {
      const started = performance.now();
      const url = await window.renderAt(time, 'image/jpeg', 0.9);
      return { url, renderMs: Math.round((performance.now() - started) * 100) / 100 };
    }, t);

    if (stillTimes.length) {
      const stills = [], images = [];
      for (const t of stillTimes) {
        const started = performance.now(), frame = await renderAt(t);
        const output = resolve(out, 'frames', `t${t.toFixed(2).replace('.', '_')}.jpg`);
        const bytes = saveURL(output, frame.url);
        const entry = { time: t, output: projectPath(output), bytes, renderMs: frame.renderMs,
          totalMs: Math.round((performance.now() - started) * 100) / 100 };
        console.log(`${entry.output}: ${entry.renderMs} ms render, ${entry.totalMs} ms total`);
        stills.push(entry); images.push({ time: t, url: frame.url });
      }
      const sheet = await page.evaluate(async ({ frames, columns, width }) => {
        const height = Math.round(width * 9 / 16), canvas = document.createElement('canvas');
        canvas.width = columns * width; canvas.height = Math.ceil(frames.length / columns) * height;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#F3EBDC'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < frames.length; i++) {
          const image = new Image(); image.src = frames[i].url; await image.decode();
          const x = i % columns * width, y = Math.floor(i / columns) * height;
          ctx.drawImage(image, x, y, width, height); ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x, y, 112, 30);
          ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif'; ctx.fillText(`${frames[i].time.toFixed(2)} s`, x + 8, y + 21);
        }
        return { url: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height };
      }, { frames: images, columns: cols, width: thumbWidth });
      const sheetPath = resolve(out, 'pdoom-contact-sheet.jpg');
      const referencePath = insideProject('assets/pdoom-contact-sheet.jpg');
      saveURL(sheetPath, sheet.url); saveURL(referencePath, sheet.url);
      report.stills = { completedAt: new Date().toISOString(), frames: stills };
      report.contactSheet = { output: projectPath(sheetPath), researchCopy: projectPath(referencePath), width: sheet.width, height: sheet.height, times: stillTimes };
      saveJSON(report);
    }

    if (clipRange) {
      const [start, end] = clipRange, count = Math.round((end - start) * fps);
      if (count < 1) throw new Error('Clip duration produces no frames at this FPS');
      const output = resolve(out, 'pdoom-chorus.mp4'), renderTimes = [], started = performance.now();
      activeEncoder = encoder(String(args.ffmpeg || 'ffmpeg'), output, fps, count);
      for (let i = 0; i < count; i++) {
        const t = start + i / fps, frame = await renderAt(t);
        await activeEncoder.write(Buffer.from(frame.url.slice(frame.url.indexOf(',') + 1), 'base64'));
        renderTimes.push({ frame: i, time: Math.round(t * 1000000) / 1000000, renderMs: frame.renderMs });
        console.log(`clip ${i + 1}/${count}: ${t.toFixed(3)} s, ${frame.renderMs} ms render`);
      }
      const encoded = await activeEncoder.finish();
      report.clip = { completedAt: new Date().toISOString(), output: projectPath(output), start, end, fps, frameCount: count,
        encodedDuration: count / fps, audio: false, codec: 'H.264', pixelFormat: 'yuv420p', crf: 19, preset: 'medium',
        ...encoded, totalMs: Math.round((performance.now() - started) * 100) / 100, frames: renderTimes };
      activeEncoder = null;
      saveJSON(report);
      console.log(`Wrote silent clip: ${projectPath(output)} (${encoded.bytes} bytes)`);
    }
    if (pageErrors.length) throw new Error(`Upstream page raised ${pageErrors.length} error(s): ${pageErrors.join('; ')}`);
    report.lastRun.status = 'success'; report.lastRun.finishedAt = new Date().toISOString(); saveJSON(report);
    console.log(`Recorded measured results: ${projectPath(RESULTS)}`);
  } catch (error) {
    activeEncoder?.abort();
    report.lastRun.status = 'failed'; report.lastRun.finishedAt = new Date().toISOString(); report.lastRun.error = error.message;
    saveJSON(report);
    throw error;
  } finally { if (browser) await browser.close(); }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
