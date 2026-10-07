import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeWorkspaceBundle } from '../web/collection/workspace-ui.js';

const bundle = () => ({
  format: 'atelier-workspace', version: 1, createdAt: '2026-10-07T00:00:00.000Z',
  records: { collection: '{ "name": "阅读角 🌿", "note": "保留\\n原文" }',
    living: null, showroom: null, imaging: null, landmark: null, kitchen: null,
    creative: null, skate: null, materials: null, underwater: null },
});

test('exported text preserves all ten raw records and reports its actual UTF-8 size', () => {
  const source = bundle(), result = serializeWorkspaceBundle(source);
  assert.deepEqual(JSON.parse(result.text), source);
  assert.equal(result.bytes, Buffer.byteLength(result.text, 'utf8'));
  assert.equal(result.compact, false);
  assert.ok(result.bytes > result.text.length, 'Chinese and emoji require UTF-8 bytes');
});

test('a pretty export exactly at the byte limit remains readable and unchanged', () => {
  const source = bundle(), pretty = JSON.stringify(source, null, 2);
  const result = serializeWorkspaceBundle(source, Buffer.byteLength(pretty));
  assert.equal(result.text, pretty);
  assert.equal(result.compact, false);
});

test('formatting cannot create an oversized file that the importer cannot reopen', () => {
  const source = bundle(), compact = JSON.stringify(source);
  const limit = Buffer.byteLength(compact);
  assert.ok(Buffer.byteLength(JSON.stringify(source, null, 2)) > limit);
  const result = serializeWorkspaceBundle(source, limit);
  assert.equal(result.bytes, limit);
  assert.equal(result.compact, true);
  assert.deepEqual(JSON.parse(result.text), source);
});

test('an over-limit compact file is rejected instead of offering an unusable export', () => {
  const source = bundle(), limit = Buffer.byteLength(JSON.stringify(source)) - 1;
  assert.throws(() => serializeWorkspaceBundle(source, limit));
});

test('UTF-8 capacity checks reject a text that fits only when counted as characters', () => {
  const source = bundle(), compact = JSON.stringify(source);
  assert.ok(Buffer.byteLength(compact) > compact.length);
  assert.throws(() => serializeWorkspaceBundle(source, compact.length));
});
