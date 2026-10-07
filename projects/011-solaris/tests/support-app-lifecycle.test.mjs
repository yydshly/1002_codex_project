import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSupportStorage } from '../web/support/storage.js';
import { SUPPORT_WORKSPACE_KEY, MAX_SUPPORT_BACKUP_BYTES } from '../web/support/state.js';

// Execute the actual app coordinator with deferred renderer/worker boundaries.
// These are UI lifecycle fixtures, not browser fault or source-mesh evidence.
const appUrl = new URL('../web/support/app.js', import.meta.url);
const html = fs.readFileSync(new URL('../web/support.html', import.meta.url), 'utf8');
const settle = async () => { await new Promise(setImmediate); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const clone = value => structuredClone(value);

class Element {
  constructor(id = '') {
    this.id = id; this.children = []; this.dataset = {}; this.attributes = new Map();
    this.listeners = new Map(); this.capture = new Set(); this.captureReleases = [];
    this.disabled = false; this.hidden = false; this.open = false; this.value = '';
    this.textContent = ''; this.classList = { toggle() {} };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = [...elements]; }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? []; list.push(listener); this.listeners.set(type, list);
  }
  async emit(type, event = {}) { for (const listener of this.listeners.get(type) ?? []) await listener(event); }
  setPointerCapture(id) { this.capture.add(id); }
  hasPointerCapture(id) { return this.capture.has(id); }
  releasePointerCapture(id) { this.capture.delete(id); this.captureReleases.push(id); }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  click() { return this.disabled ? undefined : this.onclick?.(); }
}

const table = id => ({
  asset: { id, label: id, sourcePage: `https://source.invalid/${id}`, sourceFingerprint: 'a'.repeat(64) },
  normalization: { factor: 1, translation: [0, 0, 0] },
  surfaces: [{ id: `${id}-face`, height: .75, triangleCount: 1, triangles: [], recommendation: { valid: true } }],
});
const state = id => ({
  table: { assetId: id, sha256: 'a'.repeat(64), analysisVersion: 'fixture-policy', surfaceId: `${id}-face`,
    transform: { x: 0, y: 0, z: 0, yaw: 0, scale: { x: 1, y: 1, z: 1 } } },
  lamp: { assetId: 'fixture-lamp', sha256: 'b'.repeat(64), scale: 1, yaw: 0 },
  attachment: { localAnchor: { x: 0, z: 0 } },
});

function fixture({ rejectBegin = false } = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, new Element(id));
    return nodes.get(id);
  };
  // Seed real markup's initial disabled flags; runtime changes come from app.js.
  for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    const element = node(match[1]);
    element.disabled = /\bdisabled\b/.test(match[0]);
    element.hidden = /\bhidden\b/.test(match[0]);
  }
  const modes = ['lamp', 'table', 'orbit'].map(mode => {
    const button = new Element(); button.dataset.mode = mode; return button;
  });
  const nudges = ['left', 'right', 'front', 'back'].map(direction => {
    const button = new Element(); button.dataset.nudge = direction; button.disabled = true; return button;
  });
  const closes = [...html.matchAll(/data-close="([^"]+)"/g)].map(match => {
    const button = new Element(); button.dataset.close = match[1]; return button;
  });
  const document = {
    hidden: false, activeElement: null,
    getElementById: node, createElement: () => new Element(), addEventListener() {},
    querySelectorAll(selector) {
      if (selector === '[data-mode]') return modes;
      if (selector === '[data-nudge]') return nudges;
      if (selector === '[data-close]') return closes;
      throw new Error(`Unexpected fixture selector: ${selector}`);
    },
  };
  const prepare = deferred(), updates = [], calls = [], writes = [];
  let view, worker, activeAssetId = 'old-table', workerState = state(activeAssetId), nextUpdateGate;
  const analysis = { policy: 'fixture-policy', lamp: { asset: { id: 'fixture-lamp', sourcePage: 'https://source.invalid/lamp' }, base: {} },
    tables: [table('old-table'), table('new-table')] };
  const rawFor = input => JSON.stringify({ format: 'atelier-support-workspace', version: 1, state: input });
  let storedRaw = rawFor(workerState);
  const localStorage = {
    getItem: () => storedRaw,
    setItem(key, rawText) { assert.equal(key, SUPPORT_WORKSPACE_KEY); writes.push(rawText); storedRaw = rawText; },
  };
  class FakeScene {
    constructor() { view = this; this.controls = { enabled: false }; this.surfaceHeight = .75; }
    async prepare() { await prepare.promise; }
    async update(reply) {
      updates.push(clone(reply));
      const gate = nextUpdateGate; nextUpdateGate = null;
      if (gate) await gate.promise;
    }
    pick() { return true; }
    point(event) { return { x: event.clientX ?? 0, z: event.clientY ?? 0 }; }
    home() {}
    top() {}
    showSurface() {}
  }
  class FakeWorker {
    constructor() { worker = this; this.terminated = false; }
    terminate() { this.terminated = true; }
    postMessage(message) {
      calls.push(clone(message));
      queueMicrotask(() => {
        if (this.terminated) return;
        if (message.type === 'selectAsset') { activeAssetId = message.payload.assetId; workerState = null; }
        if (message.type === 'selectSurface') workerState = state(activeAssetId);
        if (message.type === 'update' || message.type === 'apply') workerState = clone(message.payload.state);
        const result = { id: message.id, ok: !(message.type === 'begin' && rejectBegin),
          reason: message.type === 'begin' && rejectBegin ? 'fixture-begin-rejected' : undefined,
          state: clone(workerState), activeAssetId, status: { canUndo: true, canRedo: true,
            transactionActive: message.type === 'begin' && !rejectBegin } };
        if (message.type === 'init') result.analysis = clone(analysis);
        if (message.type === 'export') result.rawText = rawFor(workerState);
        this.onmessage?.({ data: result });
      });
    }
  }
  const context = vm.createContext({ SupportScene: FakeScene, Worker: FakeWorker, createSupportStorage,
    SUPPORT_WORKSPACE_KEY, MAX_SUPPORT_BACKUP_BYTES, structuredClone, URL, TextEncoder, Blob,
    Option: class { constructor(text, value) { this.text = text; this.value = value; } }, document,
    window: { localStorage, addEventListener() {} }, localStorage, location: { reload() {} },
    // Avoid creating timer handles from toast messages in these isolated tests.
    setTimeout: () => 1, clearTimeout() {}, console,
  });
  const source = fs.readFileSync(appUrl, 'utf8')
    .replace(/^import\s[^\n]+;[ \t]*\r?\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(appUrl.href));
  vm.runInContext(source, context, { filename: appUrl.pathname });
  return {
    node, modes, nudges, prepare, updates, calls, writes,
    get view() { return view; }, get worker() { return worker; }, get workerState() { return clone(workerState); },
    deferNextUpdate() { const gate = deferred(); nextUpdateGate = gate; return gate; },
    failWorker(message = 'fixture-worker-failure') { worker.onerror({ message }); },
    async ready() { await settle(); prepare.resolve(); await settle(); },
  };
}

test('renderer preparation gates asset, mode and operation actions before the first coherent render', async () => {
  const f = fixture(); await settle();
  assert.equal(f.node('asset-options').children.length, 2);
  assert.ok(f.node('asset-options').children.every(button => button.disabled));
  assert.ok(f.modes.every(button => button.disabled));
  assert.ok(f.node('save').disabled);
  assert.ok(f.node('surface').disabled);
  // Even a queued handler invocation cannot send a premature edit to the worker.
  await f.node('asset-options').children[1].onclick();
  await f.modes[1].onclick();
  await f.node('save').onclick();
  assert.deepEqual(f.calls.map(call => call.type), ['init']);
  assert.equal(f.updates.length, 0);
  f.prepare.resolve(); await settle();
  assert.equal(f.updates.at(-1).state.table.assetId, f.workerState.table.assetId);
  assert.equal(f.node('asset-title').textContent, f.workerState.table.assetId);
  assert.ok(f.node('asset-options').children.every(button => !button.disabled));
  assert.ok(f.modes.every(button => !button.disabled));
  assert.equal(f.node('save').disabled, false);
});

test('worker failure during renderer preparation cannot be undone by the late startup snapshot', async () => {
  const f = fixture(); await settle();
  f.failWorker(); f.prepare.resolve(); await settle();
  assert.equal(f.node('load-error').hidden, false);
  assert.match(f.node('error-detail').textContent, /fixture-worker-failure/);
  assert.equal(f.updates.length, 0, 'the stale first reply must never reach the renderer');
  assert.ok(f.node('save').disabled && f.node('undo').disabled && f.node('redo').disabled);
  assert.ok(f.modes.every(button => button.disabled));
  assert.equal(f.view.controls.enabled, false);
});

test('worker failure while save waits for rendering cannot write storage or restore controls', async () => {
  const f = fixture(); await f.ready();
  await f.modes.find(button => button.dataset.mode === 'orbit').onclick();
  assert.equal(f.view.controls.enabled, true);
  const gate = f.deferNextUpdate(), save = f.node('save').onclick(); await settle();
  assert.equal(f.calls.at(-1).type, 'export');
  f.failWorker(); gate.resolve(); await save; await settle();
  assert.deepEqual(f.writes, [], 'an export response completed after fatal must not be saved');
  assert.ok(f.node('save').disabled && f.node('undo').disabled && f.node('redo').disabled);
  assert.ok(f.modes.every(button => button.disabled));
  assert.equal(f.view.controls.enabled, false);
});

test('rejected transaction begin releases native pointer capture without starting an update', async () => {
  const f = fixture({ rejectBegin: true }); await f.ready();
  const host = f.node('canvas-host');
  await host.emit('pointerdown', { button: 0, pointerId: 7, clientX: 0, clientY: 0, preventDefault() {} });
  await settle();
  assert.equal(host.hasPointerCapture(7), false);
  assert.deepEqual(host.captureReleases, [7]);
  assert.equal(f.calls.filter(call => call.type === 'update').length, 0);
  assert.equal(f.node('save').disabled, false, 'the valid prior scheme remains usable');
});
