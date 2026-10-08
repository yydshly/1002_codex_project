import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const work = path.resolve('projects/014-tidewater/assets/neural-service');
const reference = path.resolve('projects/014-tidewater/web/assets/neural/cabin-reference-v1.png');
const outputPath = path.resolve('projects/014-tidewater/web/assets/neural/cabin-generated-v1.glb');
const base = 'https://microsoft-trellis-2.hf.space/gradio_api';
const session = 'tidewater-cabin-' + Date.now().toString(36);
const log = { provider: 'Microsoft official Hugging Face Space', model: 'microsoft/TRELLIS.2-4B', space: 'microsoft/TRELLIS.2', source: 'https://huggingface.co/spaces/microsoft/TRELLIS.2', session, startedAt: new Date().toISOString(), events: [], settings: { seed: 20261005, resolution: '512', sparseStructure: { guidance: 7.5, rescale: 0.7, steps: 12, rescaleT: 5 }, shape: { guidance: 7.5, rescale: 0.5, steps: 12, rescaleT: 3 }, texture: { guidance: 1, rescale: 0, steps: 12, rescaleT: 3 }, export: { decimationTarget: 100000, textureSize: 2048 } } };
async function save() { await fs.writeFile(path.join(work, 'cabin-generation-log.json'), JSON.stringify(log, null, 2)); }
async function run(fn, name, data) {
  const res = await fetch(`${base}/queue/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data, fn_index: fn, session_hash: session, trigger_id: null }), signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}: ${text}`);
  const { event_id } = JSON.parse(text);
  log.events.push({ name, fn, eventId: event_id, submittedAt: new Date().toISOString() });
  console.log(JSON.stringify({ stage: name, eventId: event_id })); await save();
  const stream = await fetch(`${base}/queue/data?session_hash=${encodeURIComponent(session)}`, { signal: AbortSignal.timeout(360000) });
  if (!stream.ok) throw new Error(`${name} stream HTTP ${stream.status}`);
  const reader = stream.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) throw new Error(`${name} stream ended before completion`);
    buffer += decoder.decode(value, { stream: true });
    let i; while ((i = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, i); buffer = buffer.slice(i + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const item = JSON.parse(line.slice(6));
        if (item.event_id && item.event_id !== event_id) continue;
        if (item.msg === 'estimation') console.log(JSON.stringify({ stage: name, rank: item.rank, queueSize: item.queue_size, eta: item.rank_eta }));
        if (item.msg === 'process_starts') console.log(JSON.stringify({ stage: name, status: 'running' }));
        if (item.msg === 'process_completed') {
          log.events.push({ name, eventId: event_id, completedAt: new Date().toISOString(), result: item }); await save(); await reader.cancel();
          if (!item.success) throw new Error(`${name}: ${JSON.stringify(item.output)}`);
          return item.output.data;
        }
        if (item.msg === 'unexpected_error') throw new Error(`${name}: ${JSON.stringify(item)}`);
      }
    }
  }
}
try {
  await fs.mkdir(work, { recursive: true });
  const image = await fs.readFile(reference);
  log.reference = { path: reference, sha256: createHash('sha256').update(image).digest('hex'), bytes: image.length };
  const upload = new FormData(); upload.append('files', new Blob([image], { type: 'image/png' }), 'cabin-reference-v1.png');
  const r = await fetch(`${base}/upload`, { method: 'POST', body: upload, signal: AbortSignal.timeout(60000) });
  const result = await r.text(); if (!r.ok) throw new Error(`Upload HTTP ${r.status}: ${result}`);
  const [uploaded] = JSON.parse(result); log.uploadedPath = uploaded; await save(); console.log(JSON.stringify({ stage: 'upload', status: 'complete' }));
  await run(2, 'start_session', []);
  const [processed] = await run(4, 'preprocess_image', [{ path: uploaded, orig_name: 'cabin-reference-v1.png', mime_type: 'image/png', meta: { _type: 'gradio.FileData' } }]);
  const result3d = await run(7, 'image_to_3d', [processed, 20261005, '512', 7.5, 0.7, 12, 5, 7.5, 0.5, 12, 3, 1, 0, 12, 3]);
  console.log(JSON.stringify({ stage: 'image_to_3d', status: 'complete', outputs: result3d.length }));
  const files = await run(9, 'extract_glb', [null, 100000, 2048]);
  const file = files.find(x => x && typeof x === 'object' && x.path?.endsWith('.glb'));
  if (!file) throw new Error('No GLB returned');
  const url = file.url || `${base}/file=${file.path}`;
  const glbResponse = await fetch(url, { signal: AbortSignal.timeout(90000) }); if (!glbResponse.ok) throw new Error(`GLB download HTTP ${glbResponse.status}`);
  const bytes = Buffer.from(await glbResponse.arrayBuffer());
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid generated GLB');
  await fs.writeFile(outputPath, bytes);
  log.output = { path: outputPath, url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; log.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ stage: 'complete', output: log.output }));
} catch (error) { log.failure = { message: error.message, at: new Date().toISOString() }; await save(); console.error(error.message); process.exitCode = 1; }
