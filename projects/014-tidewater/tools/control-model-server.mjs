import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { MAX_REQUEST_BYTES, PROVIDER, probeControlModel, validateControlInput, runControlJob } from './control-model-runner.mjs';
import { validateFineControlInput, runFineGeometryJob } from './fine-geometry-runner.mjs';
import { createDeliveryStorage, MAX_DELIVERY_JSON_BYTES } from './scene-delivery-storage.mjs';
import { createCampStorage } from './camp-proposal-storage.mjs';

const PORT = 4198, HOST = `127.0.0.1:${PORT}`, ALLOWED_ORIGIN = 'http://127.0.0.1:4196';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jobsRoot = path.join(project, 'assets', 'control-model', 'jobs');
const deliveries = createDeliveryStorage({ root: path.join(project, 'web', 'assets', 'fine-deliveries') });
const campProposals = createCampStorage({ root: path.join(project,'web/assets/camp-proposals'), deliveriesRoot:path.join(project,'web/assets/fine-deliveries') });
await mkdir(jobsRoot, { recursive: true });
const jobs = new Map(), queue = [];
let active = null;
const health = await probeControlModel();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function publicJob(job) { const { id, status, progress, recipe, geometry, receipt, error } = job; return { id, status, progress, ...(recipe ? { recipe } : {}), ...(geometry ? { geometry } : {}), ...(receipt ? { receipt } : {}), ...(error ? { error } : {}) }; }
function respond(res, status, value, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
  if (origin === ALLOWED_ORIGIN) Object.assign(headers, { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Content-SHA256' });
  res.writeHead(status, headers); res.end(JSON.stringify(value));
}
async function readBody(req, limit = MAX_REQUEST_BYTES) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(req.headers['content-type'] || '')) throw Object.assign(new Error('请求须使用 application/json。'), { httpStatus: 415 });
  if (Number(req.headers['content-length']) > limit) throw Object.assign(new Error(`请求超过 ${limit / 1048576} MiB。`), { httpStatus: 413 });
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) throw Object.assign(new Error(`请求超过 ${limit / 1048576} MiB。`), { httpStatus: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('请求 JSON 无效。'), { httpStatus: 400 }); }
}
async function advanceQueue() {
  if (active || !queue.length) return;
  const job = queue.shift(); active = job;
  job.status = 'running'; job.progress = { stage: 'starting', message: '正在准备真实模型输入。', eventCount: 0 };
  try {
    const jobDir = path.join(jobsRoot, job.id);
    if (!uuidPattern.test(job.id) || path.dirname(jobDir) !== jobsRoot) throw new Error('任务路径无效。');
    const runJob = job.kind === 'fine-geometry' ? runFineGeometryJob : runControlJob;
    const result = await runJob(job.input, { id: job.id, jobDir, cliVersion: health.cliVersion, onProgress: progress => { job.progress = progress; } });
    job.recipe = result.recipe; job.geometry = result.geometry; job.receipt = result.receipt; job.status = 'succeeded';
  } catch (error) {
    job.status = 'failed'; job.error = String(error.message || error).slice(0, 4000); if (error.receipt) job.receipt = error.receipt;
    job.progress = { stage: 'failed', message: job.error, eventCount: job.receipt?.eventCount || 0 };
  } finally {
    delete job.input; active = null;
    if (jobs.size > 1000) for (const [id, old] of jobs) { if (['succeeded', 'failed'].includes(old.status)) { jobs.delete(id); break; } }
    setImmediate(advanceQueue);
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  try {
    if (req.headers.host !== HOST) { respond(res, 403, { error: 'Host 不受支持。' }, origin); return; }
    if (origin && origin !== ALLOWED_ORIGIN) { respond(res, 403, { error: 'Origin 不受支持。' }, origin); return; }
    const url = new URL(req.url, `http://${HOST}`);
    if (url.search) { respond(res, 400, { error: '不接受查询参数。' }, origin); return; }
    if (req.method === 'OPTIONS') { respond(res, 204, null, origin); return; }
    if (req.method === 'GET' && url.pathname === '/health') { respond(res, 200, { ...health, provider: PROVIDER, running: active ? 1 : 0, queued: queue.length }, origin); return; }
    if(req.method==='POST'&&url.pathname==='/camp-proposals'){
      if(origin!==ALLOWED_ORIGIN){respond(res,403,{error:'保存营地提案须来自当前页面。'},origin);return;}
      respond(res,201,await campProposals.create(await readBody(req,MAX_DELIVERY_JSON_BYTES)),origin);return;
    }
    const campUpload=/^\/camp-proposals\/([0-9a-f-]+)\/project$/u.exec(url.pathname);
    if(req.method==='POST'&&campUpload&&uuidPattern.test(campUpload[1])){
      if(origin!==ALLOWED_ORIGIN){respond(res,403,{error:'保存营地提案须来自当前页面。'},origin);return;}
      respond(res,200,await campProposals.upload(campUpload[1],req,{sha256:req.headers['x-content-sha256'],contentLength:req.headers['content-length'],contentType:req.headers['content-type']}),origin);return;
    }
    if (req.method === 'POST' && url.pathname === '/deliveries') {
      if (origin !== ALLOWED_ORIGIN) { respond(res, 403, { error: '保存交付须来自当前创作页面。' }, origin); return; }
      respond(res, 201, await deliveries.createDelivery(await readBody(req, MAX_DELIVERY_JSON_BYTES)), origin); return;
    }
    const deliveryUpload = /^\/deliveries\/([0-9a-f-]+)\/(glb|project)$/u.exec(url.pathname);
    if (req.method === 'POST' && deliveryUpload && uuidPattern.test(deliveryUpload[1])) {
      if (origin !== ALLOWED_ORIGIN) { respond(res, 403, { error: '保存交付须来自当前创作页面。' }, origin); return; }
      const saved = await deliveries.saveBinary(deliveryUpload[1], deliveryUpload[2], req, {
        contentLength: req.headers['content-length'], sha256: req.headers['x-content-sha256'], contentType: req.headers['content-type'] || '' });
      respond(res, 200, saved, origin); return;
    }
    const found = /^\/jobs\/([0-9a-f-]+)$/u.exec(url.pathname);
    if (req.method === 'GET' && found && uuidPattern.test(found[1])) {
      const job = jobs.get(found[1]); respond(res, job ? 200 : 404, job ? publicJob(job) : { error: '未找到任务。' }, origin); return;
    }
    if (req.method === 'POST' && ['/jobs', '/fine-jobs'].includes(url.pathname)) {
      if (origin !== ALLOWED_ORIGIN) { respond(res, 403, { error: '创建任务须来自当前创作页面。' }, origin); return; }
      if (!health.available) { respond(res, 503, { error: health.error || '控制模型暂不可用。' }, origin); return; }
      if ((active ? 1 : 0) + queue.length >= 5) { respond(res, 429, { error: '控制模型队列已满；最多 1 个执行中、4 个排队。' }, origin); return; }
      const fine = url.pathname === '/fine-jobs';
      const input = (fine ? validateFineControlInput : validateControlInput)(await readBody(req));
      if ((active ? 1 : 0) + queue.length >= 5) { respond(res, 429, { error: '控制模型队列已满。' }, origin); return; }
      const id = randomUUID();
      const job = { id, input, kind: fine ? 'fine-geometry' : 'scene-recipe', status: 'queued', progress: { stage: 'queued', message: fine ? input.mode === 'refine' ? '已进入真实模型局部几何精修队列，范围外内容由合并器保留。' : '已进入真实模型精细建模队列。' : '已进入真实控制模型队列。', eventCount: 0, queuedAt: new Date().toISOString() } };
      jobs.set(id, job); queue.push(job); respond(res, 202, publicJob(job), origin); setImmediate(advanceQueue); return;
    }
    respond(res, 404, { error: '未找到接口。' }, origin);
  } catch (error) { if (!res.headersSent) respond(res, error.httpStatus || 400, { error: String(error.message || error).slice(0, 1000) }, origin); }
});
server.requestTimeout = 30000; server.headersTimeout = 10000;
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(PORT, '127.0.0.1', () => console.log(JSON.stringify({ service: 'tidewater-control-model', url: `http://${HOST}`, ...health })));
