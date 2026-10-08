import path from 'node:path';
import { mkdir, readFile, writeFile, open, rename, unlink, lstat, realpath } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { validatePlan } from '../web/creation-core.js';
import { validateCompletionRecipe } from '../web/scene-completion-core.js';
import { validateFineGeometry } from '../web/fine-geometry-core.js';
import { fingerprintPlan } from '../web/model-scene-core.js';
import { safeArchivePath } from '../web/scene-delivery-core.js';

export const MAX_DELIVERY_JSON_BYTES = 20 * 1024 * 1024;
export const MAX_DELIVERY_BINARY_BYTES = 256 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hashPattern = /^[0-9a-f]{64}$/u;
const fail = (message, httpStatus = 400) => { throw Object.assign(new Error(message), { httpStatus }); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const textJSON = value => `${JSON.stringify(value, null, 2)}\n`;

export function validateDeliveryRequest(input) {
  if (!plain(input) || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'candidate') || !Object.hasOwn(input, 'manifest')) fail('交付请求须包含 candidate 与 manifest。');
  if (!plain(input.candidate) || !plain(input.manifest)) fail('交付候选与清单无效。');
  const sourcePlan = validatePlan(input.candidate.sourcePlan), recipe = validateCompletionRecipe(input.candidate.recipe, sourcePlan);
  const geometry = validateFineGeometry(input.candidate.geometry, sourcePlan, { baseRecipe: recipe });
  const sourceFingerprint = fingerprintPlan(sourcePlan), manifest = input.manifest;
  if (manifest.format !== 'tidewater-scene-delivery.v1' || manifest.sourceFingerprint !== sourceFingerprint
      || recipe.sourceFingerprint !== sourceFingerprint || geometry.sourceFingerprint !== sourceFingerprint) fail('交付来源指纹不一致。');
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 4096) fail('交付资源清单无效。');
  const paths = new Set();
  for (const file of manifest.files) {
    if (!plain(file) || Object.keys(file).some(key => !['path', 'bytes', 'sha256'].includes(key))) fail('交付文件记录无效。');
    safeArchivePath(file.path);
    if (paths.has(file.path)) fail('交付清单包含重名文件。');
    paths.add(file.path);
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_DELIVERY_BINARY_BYTES || !hashPattern.test(file.sha256 ?? '')) fail('交付文件尺寸或 SHA-256 无效。');
  }
  const glb = manifest.files.find(file => file.path === 'scene.glb');
  if (!glb || glb.bytes < 28) fail('交付清单缺少有效 scene.glb。');
  return { candidate: { ...input.candidate, sourcePlan, recipe, geometry }, manifest, sourceFingerprint, glb };
}

function checkHeader(kind, first, tail, bytes) {
  if (kind === 'glb') {
    if (bytes < 28 || first.length < 20 || first.readUInt32LE(0) !== 0x46546c67 || first.readUInt32LE(4) !== 2
        || first.readUInt32LE(8) !== bytes || first.readUInt32LE(16) !== 0x4e4f534a
        || first.readUInt32LE(12) % 4 || 20 + first.readUInt32LE(12) > bytes) fail('上传的 GLB 文件头无效。');
  } else if (kind === 'project') {
    if (bytes < 22 || first.length < 4 || first.readUInt32LE(0) !== 0x04034b50) fail('上传的 ZIP 文件头无效。');
    // Browser delivery emits an ordinary ZIP with no archive comment.
    if (tail.length < 22 || tail.readUInt32LE(tail.length - 22) !== 0x06054b50 || tail.readUInt16LE(tail.length - 2) !== 0) fail('上传的 ZIP 结束记录无效。');
  } else fail('交付文件类型不受支持。');
}
async function hashFile(file) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest('hex'), bytes };
}

export function createDeliveryStorage({ root, publicBase = 'http://127.0.0.1:4196/assets/fine-deliveries', maxBinaryBytes = MAX_DELIVERY_BINARY_BYTES }) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) fail('交付目录须为绝对路径。');
  if (!Number.isSafeInteger(maxBinaryBytes) || maxBinaryBytes < 28 || maxBinaryBytes > MAX_DELIVERY_BINARY_BYTES) fail('交付尺寸上限无效。');
  const storageRoot = path.resolve(root), locks = new Map();
  const base = new URL(publicBase);
  if (base.origin !== 'http://127.0.0.1:4196' || base.search || base.hash) fail('交付静态地址无效。');
  const publicRoot = base.href.replace(/\/$/u, '');
  function directoryFor(id) {
    if (!uuidPattern.test(id ?? '')) fail('交付 ID 无效。');
    const directory = path.resolve(storageRoot, id);
    if (path.dirname(directory) !== storageRoot) fail('交付路径无效。');
    return directory;
  }
  async function checkedDirectory(id) {
    const directory = directoryFor(id);
    let info;
    try { info = await lstat(directory); } catch (error) { if (error.code === 'ENOENT') fail('未找到交付记录。', 404); throw error; }
    if (!info.isDirectory() || info.isSymbolicLink() || path.dirname(await realpath(directory)) !== await realpath(storageRoot)) fail('交付目录不受支持。', 403);
    return directory;
  }
  const urls = id => ({ id, sceneUrl: `${publicRoot}/${id}/scene.export.json`, glbUrl: `${publicRoot}/${id}/scene.glb`, projectUrl: `${publicRoot}/${id}/project.zip` });
  async function readRecord(id) {
    const directory = await checkedDirectory(id);
    const record = JSON.parse(await readFile(path.join(directory, 'delivery.record.json'), 'utf8'));
    if (record.id !== id || record.format !== 'tidewater-local-delivery.v1') fail('已保存交付记录无效。');
    validateDeliveryRequest({ candidate: record.candidate, manifest: record.manifest });
    return { directory, record };
  }
  async function finalizeArchive(id, directory, record) {
    let glb, project;
    try { [glb, project] = await Promise.all([lstat(path.join(directory, 'scene.glb')), lstat(path.join(directory, 'project.zip'))]); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    const expected = record.manifest.files.find(file => file.path === 'scene.glb');
    if (!glb.isFile() || !project.isFile() || glb.size !== expected.bytes || project.size < 22 || project.size > maxBinaryBytes) fail('交付文件落盘状态无效。');
    const scene = { ...record.candidate, delivery: { manifest: record.manifest,
      checks: record.candidate.delivery?.checks ?? record.manifest.checks, urls: urls(id) } };
    const target = path.join(directory, 'scene.export.json'), temporary = path.join(directory, `.scene.export.json.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, textJSON({ format: 'tidewater-completion-export.v1', exportedAt: new Date().toISOString(), scene }), { flag: 'wx' });
      await rename(temporary, target);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    return true;
  }
  async function createDelivery(input) {
    const validated = validateDeliveryRequest(input), createdAt = new Date().toISOString();
    await mkdir(storageRoot, { recursive: true });
    const id = randomUUID(), directory = directoryFor(id);
    await mkdir(directory); // A pre-existing directory is never reused.
    const record = { format: 'tidewater-local-delivery.v1', id, createdAt, sourceFingerprint: validated.sourceFingerprint,
      candidate: validated.candidate, manifest: validated.manifest };
    // Record is written last; incomplete preparation cannot accept binaries.
    await writeFile(path.join(directory, 'scene.export.json'), textJSON({ format: 'tidewater-completion-export.v1', exportedAt: createdAt, scene: validated.candidate }), { flag: 'wx' });
    await writeFile(path.join(directory, 'delivery-manifest.json'), textJSON(validated.manifest), { flag: 'wx' });
    await writeFile(path.join(directory, 'delivery.record.json'), textJSON(record), { flag: 'wx' });
    return urls(id);
  }
  async function saveBinary(id, kind, stream, { contentLength, sha256, contentType = 'application/octet-stream' } = {}) {
    if (!['glb', 'project'].includes(kind)) fail('交付文件类型不受支持。');
    directoryFor(id);
    const key = `${id}/${kind}`, previous = locks.get(key) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const { directory, record } = await readRecord(id);
      const name = kind === 'glb' ? 'scene.glb' : 'project.zip', target = path.join(directory, name);
      const expected = kind === 'glb' ? record.manifest.files.find(file => file.path === 'scene.glb') : null;
      if (sha256 != null && !hashPattern.test(sha256)) fail('上传 SHA-256 请求头无效。');
      if (kind === 'project' && !hashPattern.test(sha256 ?? '')) fail('项目上传须提供 X-Content-SHA256。');
      const expectedHash = expected?.sha256 ?? sha256;
      if (expected && sha256 && expectedHash !== sha256) fail('上传 SHA-256 与交付清单不一致。');
      const allowedTypes = kind === 'glb' ? ['application/octet-stream', 'model/gltf-binary'] : ['application/octet-stream', 'application/zip'];
      if (!allowedTypes.includes(contentType.split(';')[0].trim().toLowerCase())) fail('交付上传须使用二进制内容类型。', 415);
      if (contentLength != null && (!Number.isSafeInteger(Number(contentLength)) || Number(contentLength) < 0)) fail('上传尺寸请求头无效。');
      if (contentLength != null && Number(contentLength) > maxBinaryBytes) fail('交付上传超过尺寸上限。', 413);
      if (expected && contentLength != null && Number(contentLength) !== expected.bytes) fail('GLB 上传尺寸与交付清单不一致。');
      try {
        const existing = await hashFile(target);
        if (existing.sha256 !== expectedHash) fail('已有交付文件内容不同，不能覆盖；请创建新的交付版本。', 409);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const temporary = path.join(directory, `.${name}.${randomUUID()}.upload`), hash = createHash('sha256');
      let handle, byteCount = 0, first = Buffer.alloc(0), tail = Buffer.alloc(0);
      try {
        handle = await open(temporary, 'wx');
        const iterable = typeof stream.iterator === 'function' ? stream.iterator({ destroyOnReturn: false }) : stream;
        for await (const value of iterable) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          byteCount += chunk.length;
          if (byteCount > maxBinaryBytes) fail('交付上传超过尺寸上限。', 413);
          if (expected && byteCount > expected.bytes) fail('GLB 上传尺寸超过交付清单。');
          if (first.length < 28) first = Buffer.concat([first, chunk.subarray(0, 28 - first.length)]);
          tail = chunk.length >= 22 ? chunk.subarray(chunk.length - 22) : Buffer.concat([tail, chunk]).subarray(-22);
          hash.update(chunk); await handle.writeFile(chunk);
        }
        await handle.sync(); await handle.close(); handle = null;
        if (contentLength != null && byteCount !== Number(contentLength)) fail('交付上传尺寸与请求头不一致。');
        if (expected && byteCount !== expected.bytes) fail('GLB 上传尺寸与交付清单不一致。');
        const actualHash = hash.digest('hex');
        if (actualHash !== expectedHash) fail('交付上传 SHA-256 校验失败。');
        checkHeader(kind, first, tail, byteCount);
        // Same-directory rename only occurs after all checks. Failed uploads
        // remove their own temporary file and leave previous delivery intact.
        await rename(temporary, target);
        const complete = await finalizeArchive(id, directory, record);
        return { ...urls(id), kind, bytes: byteCount, sha256: actualHash, stored: true, complete };
      } finally {
        await handle?.close().catch(() => {});
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    });
    locks.set(key, operation);
    try { return await operation; } finally { if (locks.get(key) === operation) locks.delete(key); }
  }
  return { createDelivery, saveBinary, readRecord, urls, root: storageRoot };
}
