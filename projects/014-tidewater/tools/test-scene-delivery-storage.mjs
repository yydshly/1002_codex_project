import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createDeliveryStorage, validateDeliveryRequest, MAX_DELIVERY_BINARY_BYTES } from './scene-delivery-storage.mjs';
import { makeStoredZip } from '../web/scene-delivery-core.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const original = JSON.parse(await fs.readFile(new URL('../assets/fine-scene-first-full-flow.export.json', import.meta.url), 'utf8')).scene;
const candidate = { sourcePlan: original.sourcePlan, recipe: original.recipe, geometry: original.geometry, geometryReceipt: original.geometryReceipt };
const encoded = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] })), padded = Math.ceil(encoded.length / 4) * 4;
const glb = Buffer.alloc(28 + padded + 4);
glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(padded, 12); glb.writeUInt32LE(0x4e4f534a, 16); glb.fill(32, 20, 20 + padded); encoded.copy(glb, 20);
glb.writeUInt32LE(4, 20 + padded); glb.writeUInt32LE(0x004e4942, 24 + padded);
const manifest = { format: 'tidewater-scene-delivery.v1', sourceFingerprint: candidate.geometry.sourceFingerprint,
  files: [{ path: 'scene.glb', bytes: glb.length, sha256: hash(glb) }] };
const payload = { candidate, manifest };
assert.equal(validateDeliveryRequest(payload).sourceFingerprint, candidate.geometry.sourceFingerprint);
assert.throws(() => validateDeliveryRequest({ ...payload, manifest: { ...manifest, sourceFingerprint: 'different' } }));
assert.throws(() => validateDeliveryRequest({ ...payload, manifest: { ...manifest, files: [{ ...manifest.files[0], path: '../outside.glb' }] } }));
assert.throws(() => validateDeliveryRequest({ ...payload, manifest: { ...manifest, files: [{ ...manifest.files[0], sha256: 'invalid' }] } }));

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tidewater-delivery-storage-'));
const store = createDeliveryStorage({ root: temporary }), created = await store.createDelivery(payload);
assert.match(created.id, /^[0-9a-f-]{36}$/u); assert.ok(created.sceneUrl.endsWith('/scene.export.json'));
const directory = path.join(temporary, created.id);
const savedScene = JSON.parse(await fs.readFile(path.join(directory, 'scene.export.json'), 'utf8'));
assert.deepEqual(savedScene.scene.sourcePlan, candidate.sourcePlan);
await store.saveBinary(created.id, 'glb', Readable.from([glb.subarray(0, 5), glb.subarray(5)]), { contentLength: glb.length, contentType: 'model/gltf-binary' });
assert.deepEqual(await fs.readFile(path.join(directory, 'scene.glb')), glb);
const corrupt = Buffer.from(glb); corrupt[corrupt.length - 1] ^= 1;
await assert.rejects(store.saveBinary(created.id, 'glb', Readable.from([corrupt]), { contentLength: corrupt.length }), /SHA-256/u);
assert.deepEqual(await fs.readFile(path.join(directory, 'scene.glb')), glb);
await store.saveBinary(created.id, 'glb', Readable.from([glb]), { contentLength: glb.length });
assert.deepEqual(await fs.readFile(path.join(directory, 'scene.glb')), glb);
await assert.rejects(store.saveBinary(created.id, 'glb', Readable.from([glb]), { contentLength: MAX_DELIVERY_BINARY_BYTES + 1 }), error => error.httpStatus === 413);
await assert.rejects(store.saveBinary('../outside', 'glb', Readable.from([glb])), /ID/u);
await assert.rejects(store.saveBinary(created.id, '../../outside', Readable.from([glb])), /类型/u);
await assert.rejects(store.saveBinary(randomUUID(), 'glb', Readable.from([glb])), error => error.httpStatus === 404);

const zip = makeStoredZip([{ path: 'scene.json', bytes: new TextEncoder().encode('{}') }, { path: 'scene.glb', bytes: glb }]);
await store.saveBinary(created.id, 'project', Readable.from([zip]), { contentLength: zip.length, contentType: 'application/zip', sha256: hash(zip) });
assert.deepEqual(await fs.readFile(path.join(directory, 'project.zip')), Buffer.from(zip));
const completedScene = JSON.parse(await fs.readFile(path.join(directory, 'scene.export.json'), 'utf8')).scene;
assert.deepEqual(completedScene.delivery.urls, created);
assert.deepEqual(completedScene.delivery.manifest, manifest);
await assert.rejects(store.saveBinary(created.id, 'project', Readable.from([zip]), { contentLength: zip.length }), /X-Content-SHA256/u);
const changedZip = Buffer.from(zip); changedZip[changedZip.length - 1] ^= 1;
await assert.rejects(store.saveBinary(created.id, 'project', Readable.from([changedZip]), { sha256: hash(changedZip) }), error => error.httpStatus === 409);
assert.deepEqual(await fs.readFile(path.join(directory, 'project.zip')), Buffer.from(zip));
await store.saveBinary(created.id, 'project', Readable.from([zip]), { sha256: hash(zip) });
const restartedStore = createDeliveryStorage({ root: temporary });
assert.equal((await restartedStore.readRecord(created.id)).record.manifest.files[0].sha256, hash(glb));

const invalidHeader = Buffer.from(glb); invalidHeader[0] ^= 1;
const invalidDelivery = await store.createDelivery({ candidate, manifest: { ...manifest, files: [{ path: 'scene.glb', bytes: invalidHeader.length, sha256: hash(invalidHeader) }] } });
await assert.rejects(store.saveBinary(invalidDelivery.id, 'glb', Readable.from([invalidHeader]), { contentLength: invalidHeader.length }), /文件头/u);
await assert.rejects(fs.stat(path.join(temporary, invalidDelivery.id, 'scene.glb')), error => error.code === 'ENOENT');
await assert.rejects(store.saveBinary(invalidDelivery.id, 'project', Readable.from([changedZip]), { sha256: hash(changedZip) }), /结束记录/u);
assert.ok(!(await fs.readdir(path.join(temporary, invalidDelivery.id))).some(name => name.endsWith('.upload')));

const limited = createDeliveryStorage({ root: temporary, maxBinaryBytes: 1024 }), limitedDelivery = await limited.createDelivery(payload);
const oversized = Buffer.alloc(1100);
await assert.rejects(limited.saveBinary(limitedDelivery.id, 'project', Readable.from([oversized.subarray(0, 900), oversized.subarray(900)]), { sha256: hash(oversized) }), error => error.httpStatus === 413);
assert.ok(!(await fs.readdir(path.join(temporary, limitedDelivery.id))).some(name => name.endsWith('.upload')));
await assert.rejects(fs.stat(path.join(temporary, limitedDelivery.id, 'project.zip')), error => error.code === 'ENOENT');

// Confirm the resolved temporary target before this test-only recursive cleanup.
assert.ok(path.resolve(temporary).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
assert.ok(path.basename(temporary).startsWith('tidewater-delivery-storage-'));
await fs.rm(temporary, { recursive: true, force: true });
console.log('Delivery storage passed: plan/fingerprint/path/size/header/hash validation, streaming cap, restart, identical retry and failure preserves committed files.');
