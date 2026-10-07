import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialState, togglePin, toggleWishlist } from '../web/collection/core.js';
import { resolveSceneReturn } from '../web/collection/scene-return.js';

const ROOT = 'http://localhost:4189/projects/011-solaris/';
const TOKEN = '0123456789abcdef';
const DESTINATIONS = Object.freeze({
  living: 'index.html', showroom: 'showroom.html', imaging: 'imaging.html', landmark: 'landmark.html',
  kitchen: 'kitchen.html', creative: 'creative.html', skate: 'skate.html', materials: 'materials.html', underwater: 'underwater.html',
});
const checkpoint = sceneId => ({ version: 1, token: TOKEN, sceneId, shop: { ...initialState(), lastScene: sceneId } });
const href = (sceneId, query = `from=collection&trip=${TOKEN}`) => `${ROOT}${DESTINATIONS[sceneId]}?${query}`;
const resolve = (sceneId, value = checkpoint(sceneId), address = href(sceneId)) => resolveSceneReturn(address, JSON.stringify(value), ROOT);

test('all nine local destinations have a matching read-only return, including directory-index living URL', () => {
  for (const id of Object.keys(DESTINATIONS)) {
    const value = checkpoint(id), before = JSON.stringify(value);
    assert.deepEqual(resolve(id, value), { href: `./collection.html?resume=${TOKEN}`, sceneId: id, token: TOKEN });
    assert.equal(JSON.stringify(value), before);
  }
  assert.deepEqual(resolve('living', checkpoint('living'), `${ROOT}?from=collection&trip=${TOKEN}`), resolve('living'));
});

test('return requires the exact registered origin and target path', () => {
  const record = JSON.stringify(checkpoint('materials'));
  for (const address of [
    href('materials').replace('localhost:4189', 'outside.invalid'),
    href('materials').replace('localhost:4189', 'localhost:4190'),
    href('materials').replace('http:', 'https:'),
    href('materials').replace('/projects/011-solaris/', '/projects/other/'),
    href('materials').replace('materials.html', 'underwater.html'),
    href('materials').replace('materials.html', 'fitting.html'),
    href('materials').replace('materials.html', 'tryon.html'),
    href('materials').replace('materials.html', 'collection.html'),
    href('materials').replace('materials.html', 'nested/materials.html'),
    `file:///projects/011-solaris/materials.html?from=collection&trip=${TOKEN}`,
    'not a URL',
  ]) assert.equal(resolveSceneReturn(address, record, ROOT), null, address);
});

test('missing, duplicated, wrong-source and expired query tokens cannot expose a return', () => {
  const record = checkpoint('underwater');
  for (const query of [
    '', `from=collection`, `trip=${TOKEN}`, `from=other&trip=${TOKEN}`,
    `from=collection&from=collection&trip=${TOKEN}`, `from=collection&trip=${TOKEN}&trip=${TOKEN}`,
    `from=other&from=collection&trip=${TOKEN}`, `from=collection&trip=ffffffffffffffff&trip=${TOKEN}`,
    'from=collection&trip=ffffffffffffffff', 'from=collection&trip=0123456789ABCDEF',
    'from=collection&trip=short', `from=collection&trip=${TOKEN}%20`,
  ]) assert.equal(resolve('underwater', record, href('underwater', query)), null, query);
  const replaced = { ...record, token: 'ffffffffffffffff' };
  assert.equal(resolve('underwater', replaced), null);
});

test('damaged or structurally modified checkpoints fail without changing the supplied business data', () => {
  const value = checkpoint('skate');
  value.shop = { ...togglePin(toggleWishlist(value.shop, 'chair'), 'sofa'), lastScene: 'skate' };
  const before = JSON.stringify(value), address = href('skate');
  const invalid = [
    null, {}, { ...value, version: 2 }, { ...value, token: TOKEN.toUpperCase() },
    { ...value, sceneId: 'fitting' }, { ...value, sceneId: 'constructor' },
    { ...value, sceneId: 'materials' }, { ...value, redirect: 'https://outside.invalid' },
    { ...value, shop: { ...value.shop, price: 100 } },
    { ...value, shop: { ...value.shop, selected: 'unknown-product' } },
    { ...value, shop: { ...value.shop, pinned: ['sofa', 'sofa'] } },
    { ...value, shop: { ...value.shop, lastScene: 'tryon' } },
  ];
  for (const broken of invalid) {
    const serialized = JSON.stringify(broken);
    assert.equal(resolveSceneReturn(address, serialized, ROOT), null);
    assert.equal(JSON.stringify(broken), serialized);
  }
  for (const text of [null, undefined, '', '{broken', 'null', '[1,2]', 'x'.repeat(256 * 1024 + 1)]) {
    assert.equal(resolveSceneReturn(address, text, ROOT), null);
  }
  assert.equal(JSON.stringify(value), before);
  assert.deepEqual(resolve('skate', value), { href: `./collection.html?resume=${TOKEN}`, sceneId: 'skate', token: TOKEN });
});

test('initializing the actual bridge reads only the trip and never writes target workspace storage', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const element = tag => ({ tag, style: {}, attributes: {}, children: [],
    setAttribute(key, value) { this.attributes[key] = value; }, append(...children) { this.children.push(...children); },
  });
  const tripKey = 'atelier-collection-trip-v1';
  const stored = new Map([
    ['atelier-skate-workspace-v1', '{"original":"completed practice"}'],
    ['atelier-materials-workspace-v1', '{"original":"stable energy ledger"}'],
    ['atelier-underwater-workspace-v2', '{"original":"stable dual-subject position"}'],
  ]);
  const targetSnapshots = [...stored.entries()];
  // Node loads modules from file:, while the browser serves this module over HTTP.
  // Replace only those module-resolution bindings; execute the actual bridge logic.
  const bridgeFile = new URL('../web/collection/scene-return.js', import.meta.url);
  const coreFile = new URL('../web/collection/core.js', import.meta.url);
  const bridgeSource = (await readFile(bridgeFile, 'utf8'))
    .replace("from './core.js'", `from ${JSON.stringify(coreFile.href)}`)
    .replace('import.meta.url', JSON.stringify(`${ROOT}collection/scene-return.js`));
  try {
    for (const id of Object.keys(DESTINATIONS)) {
      stored.set(tripKey, JSON.stringify(checkpoint(id)));
      const appended = [], reads = [];
      globalThis.window = { location: { href: href(id) }, localStorage: {
        getItem(key) { reads.push(key); return stored.get(key) ?? null; },
        setItem() { assert.fail('return bridge must not save another app workspace'); },
        removeItem() { assert.fail('return bridge must not remove another app workspace'); },
      } };
      globalThis.document = { getElementById() { return null; }, createElement: element,
        body: { append(node) { appended.push(node); } },
      };
      await import(`data:text/javascript,${encodeURIComponent(bridgeSource)}#read-only-test-${id}`);
      assert.deepEqual(reads, [tripKey]);
      assert.equal(appended.length, 1);
      assert.equal(appended[0].id, 'collection-return-bridge');
      assert.equal(appended[0].children[1].href, `./collection.html?resume=${TOKEN}`);
      assert.equal(stored.get(tripKey), JSON.stringify(checkpoint(id)));
      assert.deepEqual([...stored.entries()].filter(([key]) => key !== tripKey), targetSnapshots);
    }
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete globalThis.window;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete globalThis.document;
  }
});
