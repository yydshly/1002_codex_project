import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateLocal3DAsset, getLocal3DHealth } from '../web/local-3d-provider.js';

// Exercise the public worker protocol without contacting the GPU service.
// Binary validation uses an actually generated, saved GLB rather than a fabricated placeholder mesh.
const generatedGlb = await readFile(new URL('../web/assets/neural/cabin-generated-v1.glb', import.meta.url));
const reference = await readFile(new URL('../web/assets/neural/cabin-reference-v1.png', import.meta.url));
const imageBlob = new Blob([reference], { type: 'image/png' });
const taskId = 'd5314fe467ea4cd9b55dededbd41354c';
const pathPrefix = `/assets/neural/local-jobs/${taskId}`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function worker({ health = 'ready', states, bytes = generatedGlb, adjustOutput, submittedId = taskId, healthStatus = 200, submitStatus = 202, submitError = null, downloadStatus = 200 } = {}) {
  const calls = []; let index = 0;
  const output = {
    glbUrl: `${pathPrefix}/model.glb`, manifestUrl: `${pathPrefix}/manifest.json`, bytes: bytes.length, sha256: sha256(bytes),
    provider: 'Local GPU', model: 'stabilityai/TripoSR', license: 'MIT; generated RGB texture, explicit default PBR properties',
    receipt: { source: 'https://github.com/VAST-AI-Research/TripoSR', inputMode: 'Image only', inferenceTaskId: 'actual-inference-receipt' },
  };
  adjustOutput?.(output);
  const snapshots = states || [
    { taskId, status: 'queued', stage: 'queued' },
    { taskId, status: 'running', stage: 'loading-model' },
    { taskId, status: 'running', stage: 'shape-inference' },
    { taskId, status: 'succeeded', stage: 'complete', output },
  ];
  const fetchImpl = async (url, options = {}) => {
    options.signal?.throwIfAborted(); calls.push({ url, options });
    if (url === 'http://127.0.0.1:4197/health') return Response.json({ status: health, provider: 'Local GPU', model: 'stabilityai/TripoSR', queueSize: 0 }, { status: healthStatus });
    if (url === 'http://127.0.0.1:4197/tasks' && options.method === 'POST') return Response.json(submitError ? { error: submitError } : { taskId: submittedId, status: 'queued', stage: 'queued' }, { status: submitStatus });
    if (url === `http://127.0.0.1:4197/tasks/${taskId}`) return Response.json(snapshots[Math.min(index++, snapshots.length - 1)]);
    if (url === output.glbUrl) return new Response(bytes, { status: downloadStatus });
    throw new Error(`Unexpected request outside worker protocol: ${url}`);
  };
  return { fetchImpl, calls, output };
}
const run = (transport, options = {}) => generateLocal3DAsset({ imageBlob, kind: 'boat', fetchImpl: transport.fetchImpl, pollInterval: 0, timeoutMs: 5000, ...options });

test('health reports the loopback worker state without submitting a GPU task', async () => {
  const transport = worker();
  const health = await getLocal3DHealth({ fetchImpl: transport.fetchImpl });
  assert.equal(health.status, 'ready'); assert.equal(health.model, 'stabilityai/TripoSR');
  assert.deepEqual(transport.calls.map(call => call.url), ['http://127.0.0.1:4197/health']);
});

test('queued to running to succeeded returns the complete checked GLB and its actual task receipt', async () => {
  const transport = worker(), progress = [];
  const result = await run(transport, { onProgress: event => progress.push(event) });
  assert.deepEqual(Buffer.from(await result.glbBlob.arrayBuffer()), generatedGlb);
  assert.equal(result.glbBlob.size, generatedGlb.length); assert.equal(result.taskId, taskId);
  assert.equal(result.glbUrl, `${pathPrefix}/model.glb`); assert.equal(result.remoteUrl, result.glbUrl);
  assert.equal(result.provider, 'Local GPU'); assert.equal(result.model, 'stabilityai/TripoSR');
  assert.equal(result.receipt.manifestUrl, `${pathPrefix}/manifest.json`);
  assert.equal(result.receipt.bytes, generatedGlb.length); assert.equal(result.receipt.sha256, sha256(generatedGlb));
  assert.equal(result.receipt.inferenceTaskId, 'actual-inference-receipt');
  assert.deepEqual(progress.map(event => event.stage), ['queued', 'running', 'running', 'succeeded']);
  assert(progress.every(event => event.taskId === taskId));
});

test('submission sends only the requested image and semantic kind to the fixed local endpoint', async () => {
  const transport = worker(); await run(transport);
  const submissions = transport.calls.filter(call => call.options.method === 'POST');
  assert.equal(submissions.length, 1); assert.equal(submissions[0].url, 'http://127.0.0.1:4197/tasks');
  const form = submissions[0].options.body;
  assert(form instanceof FormData); assert.deepEqual([...form.keys()], ['image', 'kind']); assert.equal(form.get('kind'), 'boat');
  assert.equal(form.get('image').size, reference.length); assert.equal(form.get('image').type, 'image/png');
  assert.equal(form.has('plan'), false); assert.equal(form.has('prompt'), false);
});

test('repeated identical worker states do not fabricate extra progress or new executions', async () => {
  const base = worker();
  const transport = worker({ states: [
    { taskId, status: 'queued', stage: 'queued' }, { taskId, status: 'queued', stage: 'queued' },
    { taskId, status: 'running', stage: 'loading-model' }, { taskId, status: 'running', stage: 'loading-model' },
    { taskId, status: 'succeeded', stage: 'complete', output: base.output },
  ] });
  const progress = []; await run(transport, { onProgress: event => progress.push(event) });
  assert.deepEqual(progress.map(event => event.stage), ['queued', 'running', 'succeeded']);
  assert.equal(transport.calls.filter(call => call.options.method === 'POST').length, 1);
});

test('failed GPU inference preserves the worker error and never downloads or invents a candidate', async () => {
  const transport = worker({ states: [
    { taskId, status: 'queued', stage: 'queued' },
    { taskId, status: 'failed', stage: 'texture-baking', error: 'CUDA out of memory while reconstructing shape' },
  ] });
  await assert.rejects(run(transport), /CUDA out of memory/);
  assert.equal(transport.calls.some(call => call.url.startsWith('/assets/')), false);
});

test('an unavailable or still checking backend refuses submission', async () => {
  for (const health of ['checking', 'unavailable']) {
    const transport = worker({ health }); await assert.rejects(run(transport), /尚未就绪/);
    assert.equal(transport.calls.length, 1); assert.equal(transport.calls.some(call => call.options.method === 'POST'), false);
  }
});

test('a completion from another task or an unknown state is rejected before downloading', async () => {
  for (const snapshot of [
    { taskId: 'another-worker-task', status: 'succeeded', output: worker().output },
    { taskId, status: '99-percent', stage: 'complete', output: worker().output },
  ]) {
    const transport = worker({ states: [snapshot] }); await assert.rejects(run(transport), /任务状态无效/);
    assert.equal(transport.calls.some(call => call.url.startsWith('/assets/')), false);
  }
});

test('GLB and manifest links cannot cross into another job, origin, traversal or query', async () => {
  for (const unsafe of [
    '/assets/neural/local-jobs/another-worker-task/model.glb', 'https://example.org/model.glb',
    `${pathPrefix}/../another/model.glb`, `${pathPrefix}/model.glb?task=another`, `${pathPrefix}/model.glb#other`, `${pathPrefix}\\model.glb`,
    `${pathPrefix}/%2e%2e/another/model.glb`, `${pathPrefix}/%2E%2E/model.glb`, `${pathPrefix}/nested/model.glb`, `${pathPrefix}//model.glb`,
  ]) {
    for (const field of ['glbUrl', 'manifestUrl']) {
      const transport = worker({ adjustOutput: output => { output[field] = unsafe; } });
      await assert.rejects(run(transport), /结果路径与实际任务不匹配/);
      assert.equal(transport.calls.some(call => call.url.startsWith('/assets/')), false);
    }
  }
});

test('invalid output checksum and size metadata are refused before file retrieval', async () => {
  for (const change of [
    output => { output.bytes = 0; }, output => { output.bytes = 64 * 1048576 + 1; }, output => { output.bytes = 1.5; },
    output => { delete output.sha256; }, output => { output.sha256 = 'not-a-sha256'; },
  ]) {
    const transport = worker({ adjustOutput: change }); await assert.rejects(run(transport), /文件校验记录/);
    assert.equal(transport.calls.some(call => call.url.startsWith('/assets/')), false);
  }
});

test('mismatched file contents or byte length never produce a successful GLB', async () => {
  for (const change of [output => { output.bytes += 4; }, output => { output.sha256 = '0'.repeat(64); }]) {
    const transport = worker({ adjustOutput: change }); await assert.rejects(run(transport), /输出校验记录不一致/);
  }
});

test('a hash-matching file with an invalid container, version or declared length is rejected', async () => {
  const invalidMagic = Buffer.from(generatedGlb); invalidMagic[0] = 0;
  const invalidVersion = Buffer.from(generatedGlb); invalidVersion.writeUInt32LE(1, 4);
  const invalidLength = Buffer.from(generatedGlb); invalidLength.writeUInt32LE(generatedGlb.length + 4, 8);
  for (const bytes of [invalidMagic, invalidVersion, invalidLength, generatedGlb.subarray(0, 11)]) {
    const transport = worker({ bytes }); await assert.rejects(run(transport), /不是完整 GLB 2\.0/);
  }
});

test('health, submit and model download HTTP errors remain failures', async () => {
  await assert.rejects(run(worker({ healthStatus: 503 })), /HTTP 503/);
  await assert.rejects(run(worker({ submitStatus: 429 })), /HTTP 429/);
  await assert.rejects(run(worker({ downloadStatus: 404 })), /GLB 未能读取/);
});

test('actual backend rejection details are preserved for unsupported images and a full queue', async () => {
  for (const [submitStatus, submitError] of [[400, '当前本地入口需要透明背景 PNG/WebP'], [429, 'Local GPU queue is full']]) {
    const transport = worker({ submitStatus, submitError });
    await assert.rejects(run(transport), error => { assert.match(error.message, new RegExp(`HTTP ${submitStatus}`)); assert(error.message.includes(submitError)); return true; });
    assert.equal(transport.calls.some(call => call.url.startsWith('/assets/')), false);
  }
});

test('invalid images, kinds and task IDs stop before accessing a result', async () => {
  for (const options of [
    { imageBlob: new Blob([], { type: 'image/png' }) }, { imageBlob: new Blob(['text'], { type: 'text/plain' }) },
    { imageBlob: new Blob([new Uint8Array(8 * 1048576 + 1)], { type: 'image/png' }) }, { kind: 'whole-world' },
  ]) { const transport = worker(); await assert.rejects(run(transport, options)); assert.equal(transport.calls.length, 0); }
  for (const submittedId of ['../../wrong', 'short', undefined]) {
    const transport = worker({ submittedId: submittedId === undefined ? null : submittedId });
    await assert.rejects(run(transport), /实际任务 ID/);
    assert.equal(transport.calls.some(call => call.url.startsWith('/assets/')), false);
  }
});

test('pre-aborted input and cancellation during a queued wait stop further requests', async () => {
  const before = new AbortController(); before.abort(new DOMException('Cancelled before submit', 'AbortError'));
  const first = worker(); await assert.rejects(run(first, { signal: before.signal }), { name: 'AbortError' }); assert.equal(first.calls.length, 0);
  const controller = new AbortController(), waiting = worker({ states: [{ taskId, status: 'queued', stage: 'queued' }] });
  await assert.rejects(run(waiting, { signal: controller.signal, pollInterval: 1000, onProgress: () => setTimeout(() => controller.abort(new DOMException('Cancelled wait', 'AbortError')), 0) }), { name: 'AbortError' });
  assert.equal(waiting.calls.filter(call => call.url.includes(`/tasks/${taskId}`)).length, 1);
  assert.equal(waiting.calls.some(call => call.url.startsWith('/assets/')), false);
});

test('a worker that remains queued times out without claiming a remote cancellation or success', async () => {
  const transport = worker({ states: [{ taskId, status: 'queued', stage: 'queued' }] });
  await assert.rejects(run(transport, { pollInterval: 5, timeoutMs: 1 }), /等待超时/);
  assert.equal(transport.calls.some(call => call.url.startsWith('/assets/')), false);
});
