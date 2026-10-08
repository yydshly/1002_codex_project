import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateTrellisAsset, TrellisProviderError } from '../web/trellis-provider.js';

// Saved official metadata and the successfully generated asset are local fixtures.
// These tests never make an external request or consume a GPU quota.
const recordedConfig = JSON.parse(await readFile(new URL('../assets/neural-service/trellis-config.json', import.meta.url), 'utf8'));
const generatedGlb = await readFile(new URL('../web/assets/neural/cabin-generated-v1.glb', import.meta.url));
const reference = await readFile(new URL('../web/assets/neural/cabin-reference-v1.png', import.meta.url));
const imageBlob = new Blob([reference], { type: 'image/png' });

function transport({ quota = false, invalidGlb = false, missingEndpoint = false, abortAtQueue = false, controller } = {}) {
  const config = structuredClone(recordedConfig);
  // Shift live function IDs to verify that the adapter does not hard-code them.
  config.dependencies.forEach(dependency => { dependency.id += 100; });
  if (missingEndpoint) config.dependencies = config.dependencies.filter(item => item.api_name !== 'extract_glb');
  let serial = 0;
  let current;
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/config')) return Response.json(config);
    if (url.endsWith('/upload')) return Response.json(['/tmp/reference.png']);
    if (url.endsWith('/queue/join')) {
      const request = JSON.parse(options.body);
      const dependency = config.dependencies.find(item => item.id === request.fn_index);
      assert(dependency, 'Requested function must exist in live config');
      current = { ...request, event: `task-${++serial}`, name: dependency.api_name };
      return Response.json({ event_id: current.event });
    }
    if (url.includes('/queue/data?')) {
      if (abortAtQueue) {
        controller.abort();
        throw new Error('Transport aborted');
      }
      const success = !(quota && current.name === 'image_to_3d');
      const data = current.name === 'preprocess_image'
        ? [{ path: '/tmp/processed.png', meta: { _type: 'gradio.FileData' } }]
        : current.name === 'extract_glb'
          ? [{ path: '/tmp/asset.glb', url: 'https://microsoft-trellis-2.hf.space/gradio_api/file=/tmp/asset.glb' }]
          : [];
      const events = [
        { msg: 'process_completed', event_id: 'unrelated-old-event', success: false, output: { error: 'Old task error' } },
        { msg: 'estimation', event_id: current.event, rank: 2, queue_size: 3 },
        { msg: 'process_starts', event_id: current.event },
        { msg: 'progress', event_id: current.event, progress_data: [{ index: 3, length: 12 }] },
        { msg: 'process_completed', event_id: current.event, success, output: success ? { data, duration: 1 } : { error: 'You have exceeded your GPU quota' } },
      ];
      const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''));
      return new Response(new ReadableStream({
        start(stream) {
          // Split JSON tokens and CRLF separators across reads as a real SSE connection can.
          for (let offset = 0; offset < bytes.length; offset += 17) stream.enqueue(bytes.subarray(offset, offset + 17));
          stream.close();
        },
      }));
    }
    if (url.includes('/file=')) return new Response(invalidGlb ? new Uint8Array(23) : generatedGlb);
    throw new Error(`Unexpected transport URL: ${url}`);
  };
  return { fetch, calls };
}

async function successfulRun(context) {
  const mock = transport();
  const progress = [];
  const result = await generateTrellisAsset({ imageBlob, fetchImpl: mock.fetch, onProgress: event => progress.push(event) });
  context.after(() => URL.revokeObjectURL(result.glbUrl));
  return { result, mock, progress };
}

test('returns the complete generated GLB as a Blob', async context => {
  const { result } = await successfulRun(context);
  assert.equal(result.glbBlob.size, generatedGlb.length);
  assert.deepEqual(Buffer.from(await result.glbBlob.arrayBuffer()), generatedGlb);
  assert.equal(result.provider, 'Microsoft');
  assert.equal(result.model, 'TRELLIS.2-4B');
});

test('resolves function IDs from live config when indices drift', async context => {
  const { result, mock } = await successfulRun(context);
  assert.equal(result.receipt.api.indices.image_to_3d, 107);
  const requests = mock.calls.filter(call => call.url.endsWith('/queue/join')).map(call => JSON.parse(call.options.body));
  assert.deepEqual(requests.map(request => request.fn_index), [102, 104, 107, 109]);
});

test('records real task IDs and an image-only input contract', async context => {
  const { result, mock } = await successfulRun(context);
  assert.equal(result.taskId, 'task-3');
  assert.equal(result.exportTaskId, 'task-4');
  assert.equal(result.receipt.input.sendsPlan, false);
  assert.equal(result.receipt.input.sendsTextPrompt, false);
  assert.equal(result.receipt.input.bytes, reference.length);
  for (const call of mock.calls.filter(call => call.url.endsWith('/queue/join'))) {
    const request = JSON.parse(call.options.body);
    assert.equal(request.plan, undefined);
    assert.equal(request.prompt, undefined);
  }
});

test('parses fragmented SSE and ignores another task’s stale completion', async context => {
  const { progress } = await successfulRun(context);
  assert.equal(progress.at(-1).stage, 'complete');
  assert(progress.some(event => event.rank === 2 && event.queueSize === 3));
  assert(progress.some(event => event.progressData?.[0]?.index === 3));
  assert(progress.filter(event => event.status === 'complete').every(event => event.taskId.startsWith('task-')));
});

test('uses config input defaults while selecting the seed and 512 resolution', async context => {
  const { mock } = await successfulRun(context);
  const generation = mock.calls.filter(call => call.url.endsWith('/queue/join')).map(call => JSON.parse(call.options.body)).find(request => request.fn_index === 107);
  assert.equal(generation.data.length, 15);
  assert.equal(generation.data[1], 20261005);
  assert.equal(generation.data[2], '512');
  assert.equal(generation.data[3], 7.5);
  assert.equal(generation.data[5], 12);
});

test('preserves a genuine quota failure instead of returning a candidate', async () => {
  await assert.rejects(generateTrellisAsset({ imageBlob, fetchImpl: transport({ quota: true }).fetch }), error => {
    assert(error instanceof TrellisProviderError);
    assert.equal(error.code, 'quota-exceeded');
    assert.match(error.providerMessage, /exceeded your GPU quota/);
    assert.equal(error.receipt.stages.find(stage => stage.name === 'image_to_3d').success, false);
    assert.equal(error.receipt.output, undefined);
    return true;
  });
});

test('rejects a downloaded file that is not a valid GLB envelope', async () => {
  await assert.rejects(generateTrellisAsset({ imageBlob, fetchImpl: transport({ invalidGlb: true }).fetch }), { code: 'invalid-model' });
});

test('reports a changed provider API before uploading the image', async () => {
  const mock = transport({ missingEndpoint: true });
  await assert.rejects(generateTrellisAsset({ imageBlob, fetchImpl: mock.fetch }), { code: 'api-changed' });
  assert.equal(mock.calls.some(call => call.url.endsWith('/upload')), false);
});

test('user cancellation stops local waiting without claiming to cancel remote GPU work', async () => {
  const controller = new AbortController();
  await assert.rejects(generateTrellisAsset({ imageBlob, signal: controller.signal, fetchImpl: transport({ abortAtQueue: true, controller }).fetch }), error => {
    assert.equal(error.code, 'aborted');
    assert.match(error.message, /远程任务可能继续运行/);
    return true;
  });
});

test('network failure is reported without simulated generation success', async () => {
  await assert.rejects(generateTrellisAsset({ imageBlob, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), error => {
    assert.equal(error.code, 'provider-network');
    assert.equal(error.receipt.completedAt, undefined);
    assert.equal(error.receipt.output, undefined);
    return true;
  });
});

test('rejects an invalid image before any network request', async () => {
  const mock = transport();
  await assert.rejects(generateTrellisAsset({ imageBlob: new Blob(['not an image'], { type: 'text/plain' }), fetchImpl: mock.fetch }), { code: 'invalid-input' });
  assert.equal(mock.calls.length, 0);
});
