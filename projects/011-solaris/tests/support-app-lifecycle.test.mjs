import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSupportStorage } from '../web/support/storage.js';
import { createSupportDraft } from '../web/support/draft.js';
import { SupportStore, parseSupportBackup, SUPPORT_WORKSPACE_KEY, MAX_SUPPORT_BACKUP_BYTES } from '../web/support/state.js';

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
const pageUrl = 'http://fixture.invalid/projects/011-solaris/support.html';

class EventTargetFixture {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    if (!list.includes(listener)) list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item !== listener));
  }
  async emit(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) await listener(event);
  }
  listenerCount(type) { return (this.listeners.get(type) ?? []).length; }
}

class Element extends EventTargetFixture {
  constructor(id = '') {
    super();
    this.id = id; this.children = []; this.dataset = {}; this.attributes = new Map();
    this.capture = new Set(); this.captureReleases = [];
    this.disabled = false; this.hidden = false; this.open = false; this.value = '';
    this.textContent = ''; this.classList = { toggle() {} };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  get href() { return this.hasAttribute('href') ? new URL(this.getAttribute('href'), pageUrl).href : ''; }
  set href(value) { this.setAttribute('href', value); }
  get target() { return this.getAttribute('target') ?? ''; }
  set target(value) { this.setAttribute('target', value); }
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = [...elements]; }
  closest(selector) {
    assert.equal(selector, 'a[href]');
    let element = this;
    while (element) {
      if (element.tagName === 'A' && element.hasAttribute('href')) return element;
      element = element.parentElement;
    }
    return null;
  }
  setPointerCapture(id) { this.capture.add(id); }
  hasPointerCapture(id) { return this.capture.has(id); }
  releasePointerCapture(id) { this.capture.delete(id); this.captureReleases.push(id); }
  focus() {}
  showModal() { this.open = true; }
  close() {
    if (!this.open) return;
    this.open = false;
    // Native dialog close notification is queued, rather than inline.
    queueMicrotask(() => { void this.emit('close'); });
  }
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

function fixture({ rejectBegin = false, initialRaw, rejectPlacement = false } = {}) {
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
  const document = Object.assign(new EventTargetFixture(), {
    hidden: false, activeElement: null,
    getElementById: node, createElement: () => new Element(),
    querySelectorAll(selector) {
      if (selector === '[data-mode]') return modes;
      if (selector === '[data-nudge]') return nudges;
      if (selector === '[data-close]') return closes;
      throw new Error(`Unexpected fixture selector: ${selector}`);
    },
  });
  const prepare = deferred(), updates = [], calls = [], writes = [], navigations = [];
  let view, worker, activeAssetId = 'old-table', store, pendingSelection = false, nextUpdateGate;
  const analysis = { policy: 'fixture-policy', lamp: { asset: { id: 'fixture-lamp', sourcePage: 'https://source.invalid/lamp' }, base: {} },
    tables: [table('old-table'), table('new-table')] };
  const rawFor = input => JSON.stringify({ format: 'atelier-support-workspace', version: 1, state: input });
  let storedRaw = initialRaw === undefined ? rawFor(state(activeAssetId)) : initialRaw;
  let writeFailure = false, mutateAfterWrite = false, navigationFailure = false;
  const localStorage = {
    getItem(key) { assert.equal(key, SUPPORT_WORKSPACE_KEY); return storedRaw; },
    setItem(key, rawText) {
      assert.equal(key, SUPPORT_WORKSPACE_KEY);
      if (writeFailure) throw new Error('fixture-storage-write-refused');
      writes.push(rawText); storedRaw = mutateAfterWrite ? rawFor(state('new-table')) : rawText;
    },
  };
  const window = Object.assign(new EventTargetFixture(), { localStorage });
  const location = {
    href: pageUrl,
    reload() {},
    assign(url) {
      if (navigationFailure) throw new Error('fixture-navigation-refused');
      navigations.push(url);
    },
  };
  const options = {
    analysisVersion: 'fixture-policy',
    assets: new Map([
      ...['old-table', 'new-table'].map(id => [id, { sha256: 'a'.repeat(64), surfaces: [`${id}-face`] }]),
      ['fixture-lamp', { sha256: 'b'.repeat(64) }],
    ]),
    validatePlacement: () => rejectPlacement ? { ok: false, reason: 'fixture-placement-rejected' } : { ok: true },
    checkSweep: () => ({ ok: true }),
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
        let fields = { ok: true };
        const type = message.type, payload = message.payload;
        if (type === 'init') {
          const checked = payload.savedRaw == null ? null : parseSupportBackup(payload.savedRaw, options);
          if (checked?.ok) store = new SupportStore({ ...options, initialState: checked.state });
          pendingSelection = !store;
          fields.analysis = clone(analysis);
          if (checked && !checked.ok) fields.savedRejected = checked.reason;
        } else if (type === 'selectAsset') {
          store?.cancel('fixture-select-asset'); activeAssetId = payload.assetId; pendingSelection = true;
        } else if (type === 'selectSurface') {
          const next = state(activeAssetId); next.table.surfaceId = payload.surfaceId;
          if (!store) store = new SupportStore({ ...options, initialState: next });
          else fields = store.apply(next, 'fixture-select-surface');
          if (fields.ok) pendingSelection = false;
        } else if (type === 'checkBackup') {
          fields = parseSupportBackup(payload.rawText, options);
        } else if (type === 'restore') {
          if (store) fields = store.restore(payload.rawText);
          else {
            fields = parseSupportBackup(payload.rawText, options);
            if (fields.ok) store = new SupportStore({ ...options, initialState: fields.state });
          }
          if (fields.ok) pendingSelection = false;
        } else if (type === 'undo' && pendingSelection && store) {
          pendingSelection = false;
        } else if (pendingSelection || !store) {
          fields = { ok: false, reason: 'fixture-select-surface-before-export' };
        } else if (type === 'begin' && rejectBegin) {
          fields = { ok: false, reason: 'fixture-begin-rejected' };
        } else if (type === 'export') {
          fields.rawText = store.export();
        } else if (type === 'apply') {
          fields = store.apply(payload.state, payload.detail);
        } else if (type === 'update') {
          fields = store.update(payload.state);
        } else if (type === 'begin') {
          fields = store.begin(payload.label);
        } else if (type === 'cancel') {
          fields = store.cancel(payload.reason);
        } else if (['commit', 'undo', 'redo'].includes(type)) {
          fields = store[type]();
        } else throw new Error(`Unexpected fixture worker command: ${type}`);
        if (store && !pendingSelection) activeAssetId = store.getState().table.assetId;
        const status = store?.getStatus() ?? { canUndo: false, canRedo: false, transactionActive: false };
        if (pendingSelection && store) status.canUndo = true;
        const result = { ...fields, id: message.id, state: pendingSelection ? null : store?.getState() ?? null,
          activeAssetId, status: { ...status, pendingSurfaceChoice: pendingSelection } };
        this.onmessage?.({ data: result });
      });
    }
  }
  const context = vm.createContext({ SupportScene: FakeScene, Worker: FakeWorker, createSupportStorage, createSupportDraft,
    SUPPORT_WORKSPACE_KEY, MAX_SUPPORT_BACKUP_BYTES, structuredClone, URL, TextEncoder, Blob,
    Option: class { constructor(text, value) { this.text = text; this.value = value; } }, document,
    window, localStorage, location,
    // Avoid creating timer handles from toast messages in these isolated tests.
    setTimeout: () => 1, clearTimeout() {}, console,
  });
  const source = fs.readFileSync(appUrl, 'utf8')
    .replace(/^import\s[^\n]+;[ \t]*\r?\n/gm, '')
    .replaceAll('import.meta.url', JSON.stringify(appUrl.href));
  vm.runInContext(source, context, { filename: appUrl.pathname });
  return {
    node, modes, nudges, prepare, updates, calls, writes, navigations, document, window, rawFor,
    get view() { return view; }, get worker() { return worker; }, get workerState() { return store?.getState() ?? null; },
    get storedRaw() { return storedRaw; },
    setWriteFailure(value = true) { writeFailure = value; },
    setReadbackMutation(value = true) { mutateAfterWrite = value; },
    setRejectPlacement(value = true) { rejectPlacement = value; },
    setNavigationFailure(value = true) { navigationFailure = value; },
    async externalStorage(rawText, key = SUPPORT_WORKSPACE_KEY) {
      const oldValue = storedRaw;
      if (key === SUPPORT_WORKSPACE_KEY || key === null) storedRaw = rawText;
      await window.emit('storage', { key, oldValue, newValue: rawText }); await settle();
    },
    async nudge(direction = 'right') {
      await nudges.find(button => button.dataset.nudge === direction).click(); await settle();
    },
    async clickLink(href = './overview.html', attributes = {}, overrides = {}, nested = true) {
      const anchor = new Element(); anchor.tagName = 'A'; anchor.href = href;
      for (const [name, value] of Object.entries(attributes)) anchor.setAttribute(name, value);
      const child = new Element(); child.parentElement = anchor;
      const event = { target: nested ? child : anchor, button: 0, defaultPrevented: false,
        ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
        preventDefault() { this.defaultPrevented = true; }, ...overrides };
      await document.emit('click', event); await settle(); return event;
    },
    async beforeUnload() {
      const event = { defaultPrevented: false, returnValue: undefined,
        preventDefault() { this.defaultPrevented = true; } };
      await window.emit('beforeunload', event); return event;
    },
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

test('draft status follows verified values through edits, rejection, undo and redo without tracking camera changes', async () => {
  const f = fixture(); await f.ready();
  const original = clone(f.workerState);
  assert.equal(f.node('save-status').dataset.state, 'saved');
  assert.equal(f.window.listenerCount('beforeunload'), 0);
  await f.modes.find(button => button.dataset.mode === 'orbit').click();
  await f.node('top-view').click(); await f.node('home-view').click();
  assert.equal(f.node('save-status').dataset.state, 'saved');
  f.setRejectPlacement(); await f.nudge();
  assert.deepEqual(f.workerState, original);
  assert.equal(f.node('save-status').dataset.state, 'saved', 'a refused change has no new draft');
  f.setRejectPlacement(false); await f.nudge();
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  assert.match(f.node('save-status').textContent, /未保存/);
  assert.equal(f.window.listenerCount('beforeunload'), 1);
  assert.equal((await f.beforeUnload()).defaultPrevented, true);
  await f.node('undo').click();
  assert.deepEqual(f.workerState, original);
  assert.equal(f.node('save-status').dataset.state, 'saved');
  assert.equal(f.window.listenerCount('beforeunload'), 0);
  await f.node('redo').click();
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  assert.equal(f.window.listenerCount('beforeunload'), 1);
  assert.deepEqual(f.writes, [], 'edit/history/camera commands do not autosave');
});

test('public backup, file checking and opening another scheme never certify the draft as saved', async () => {
  const f = fixture(); await f.ready(); await f.nudge();
  const originalSavedRaw = f.storedRaw;
  await f.node('backup').click();
  assert.equal(f.node('backup-dialog').open, true);
  assert.deepEqual(JSON.parse(f.node('configuration').value).state, f.workerState);
  assert.match(f.node('download').href, /^blob:/);
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  await f.node('check-backup').click();
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  const imported = state('new-table'); imported.attachment.localAnchor.x = -.1;
  f.node('configuration').value = f.rawFor(imported); f.node('configuration').oninput();
  await f.node('check-backup').click(); await f.node('apply-backup').click(); await settle();
  assert.deepEqual(f.workerState, imported);
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  assert.equal(f.window.listenerCount('beforeunload'), 1);
  assert.deepEqual(f.writes, []);
  assert.equal(f.storedRaw, originalSavedRaw);
});

test('ordinary nested links guard dirty drafts while browser-owned link actions remain available', async () => {
  const f = fixture(); await f.ready();
  const cleanLink = await f.clickLink();
  assert.equal(cleanLink.defaultPrevented, false);
  assert.equal(f.node('leave-dialog').open, false);
  await f.nudge();
  const exclusions = [
    ['./overview.html', { target: '_blank' }, {}],
    ['./overview.html', { download: '' }, {}],
    ['./support.html#details', {}, {}],
    [pageUrl, {}, {}],
    ['./overview.html', {}, { ctrlKey: true }],
    ['./overview.html', {}, { button: 1 }],
    ['./overview.html', {}, { defaultPrevented: true }],
    ['mailto:fixture@example.invalid', {}, {}],
  ];
  for (const [href, attributes, overrides] of exclusions) {
    const event = await f.clickLink(href, attributes, overrides);
    assert.equal(f.node('leave-dialog').open, false, `excluded link ${href} opens no app modal`);
    assert.equal(event.defaultPrevented, Boolean(overrides.defaultPrevented));
  }
  const guarded = await f.clickLink('./overview.html#next-steps');
  assert.equal(guarded.defaultPrevented, true);
  assert.equal(f.node('leave-dialog').open, true);
  assert.equal(f.node('leave-save').disabled, false);
  await f.node('leave-continue').click(); await settle();
  assert.equal(f.node('leave-dialog').open, false);
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  assert.deepEqual(f.navigations, []);
  assert.deepEqual(f.writes, []);
});

test('save and leave navigates only after verified storage, with no duplicate native leave guard', async () => {
  const f = fixture(); await f.ready(); await f.nudge();
  const draft = clone(f.workerState);
  await f.clickLink('./overview.html#next-steps');
  await f.node('leave-save').click(); await settle();
  assert.equal(f.writes.length, 1);
  assert.deepEqual(JSON.parse(f.storedRaw).state, draft);
  assert.deepEqual(f.navigations, ['http://fixture.invalid/projects/011-solaris/overview.html#next-steps']);
  assert.equal(f.node('leave-dialog').open, false);
  assert.equal(f.node('save-status').dataset.state, 'saved');
  assert.equal(f.window.listenerCount('beforeunload'), 0);
  assert.equal((await f.beforeUnload()).defaultPrevented, false);
});

test('pageshow restores draft protection after an explicitly discarded navigation', async () => {
  const f = fixture(); await f.ready(); await f.nudge();
  await f.clickLink('./overview.html'); await f.node('leave-discard').click(); await settle();
  assert.deepEqual(f.navigations, ['http://fixture.invalid/projects/011-solaris/overview.html']);
  assert.equal(f.window.listenerCount('beforeunload'), 0);
  assert.deepEqual(f.writes, [], 'direct leave does not silently save');
  // Simulate the native lifecycle notification; this is not a real bfcache run.
  await f.window.emit('pageshow', { persisted: true }); await settle();
  await f.nudge('back');
  assert.equal(f.window.listenerCount('beforeunload'), 1);
  const event = await f.clickLink('./integration.html');
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.node('leave-dialog').open, true);
  assert.equal(f.navigations.length, 1, 'the old leave authorization cannot cover the new destination');
});

test('closing a delayed save and leave cancels navigation intent, and backup stays on the page', async () => {
  const f = fixture(); await f.ready(); await f.nudge();
  await f.clickLink('./overview.html');
  const gate = f.deferNextUpdate(), saving = f.node('leave-save').click(); await settle();
  assert.equal(f.calls.at(-1).type, 'export');
  assert.equal(f.node('leave-discard').disabled, true, 'pending save cannot be interrupted by direct leave');
  await f.node('leave-continue').click(); await settle();
  gate.resolve(); await saving; await settle();
  assert.deepEqual(f.navigations, [], 'the late successful save cannot resume a closed navigation request');
  assert.equal(f.writes.length, 1, 'the explicitly started save still completes its verification');
  assert.equal(f.node('save-status').dataset.state, 'saved');
  await f.nudge('back'); await f.clickLink('./integration.html');
  await f.node('leave-backup').click(); await settle();
  assert.equal(f.node('leave-dialog').open, false);
  assert.equal(f.node('backup-dialog').open, true);
  assert.deepEqual(JSON.parse(f.node('configuration').value).state, f.workerState);
  f.node('backup-dialog').close(); await settle();
  assert.deepEqual(f.navigations, [], 'closing the backup never resumes the old destination');
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  assert.equal(f.writes.length, 1, 'backup is not another save');
});

test('write rejection, readback races and stale storage keep the draft and prevent save and leave', async () => {
  for (const fault of ['write-refused', 'readback-changed', 'stale']) {
    const f = fixture(); await f.ready(); await f.nudge();
    const draft = clone(f.workerState);
    if (fault === 'write-refused') f.setWriteFailure();
    else if (fault === 'readback-changed') f.setReadbackMutation();
    else await f.externalStorage(f.rawFor(state('new-table')));
    await f.clickLink('./overview.html'); await f.node('leave-save').click(); await settle();
    assert.deepEqual(f.workerState, draft, `${fault} preserves the complete local scheme`);
    assert.deepEqual(f.navigations, [], `${fault} cannot leave`);
    assert.equal(f.node('leave-dialog').open, false);
    assert.equal(f.node('save-conflict-dialog').open, true);
    assert.equal(f.node('save-status').dataset.state, 'unsaved');
    assert.equal(f.window.listenerCount('beforeunload'), 1);
    assert.equal((await f.beforeUnload()).defaultPrevented, true);
    assert.equal(f.writes.length, fault === 'readback-changed' ? 1 : 0);
  }
});

test('external storage changes require explicit adoption and preserve undo to the original draft', async () => {
  const f = fixture(); await f.ready();
  await f.externalStorage('irrelevant', 'another-project-key');
  assert.equal(f.node('save-status').dataset.state, 'saved', 'other storage keys are outside this workbench');
  await f.nudge(); const localDraft = clone(f.workerState);
  const incoming = state('new-table'); incoming.attachment.localAnchor.z = -.1;
  const incomingRaw = f.rawFor(incoming);
  await f.externalStorage(incomingRaw);
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  await f.node('save').click();
  assert.equal(f.node('save-conflict-dialog').open, true);
  await f.node('check-saved').click();
  assert.equal(f.node('saved-configuration').value, incomingRaw);
  assert.equal(f.node('save-status').dataset.state, 'unsaved', 'checking is not adoption');
  await f.node('open-saved').click(); await settle();
  assert.deepEqual(f.workerState, incoming);
  assert.equal(f.node('save-status').dataset.state, 'saved');
  assert.equal(f.window.listenerCount('beforeunload'), 0);
  await f.node('undo').click();
  assert.deepEqual(f.workerState, localDraft);
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  await f.node('redo').click();
  assert.deepEqual(f.workerState, incoming);
  assert.equal(f.node('save-status').dataset.state, 'saved');
  assert.deepEqual(f.writes, [], 'adoption and history do not rewrite the record');
});

test('pending choices, active gestures and worker interruption retain protection without inventing a saved scheme', async () => {
  const f = fixture(); await f.ready();
  await f.node('asset-options').children[1].click();
  assert.equal(f.updates.at(-1).state, null);
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  await f.clickLink('./overview.html');
  assert.equal(f.node('leave-save').disabled, true);
  assert.equal(f.node('leave-backup').disabled, true);
  assert.match(f.node('leave-message').textContent, /台面|完整方案/);
  await f.node('leave-continue').click(); await settle(); await f.node('undo').click();
  assert.equal(f.node('save-status').dataset.state, 'saved', 'undoing a candidate selection returns to the saved placement');
  const host = f.node('canvas-host');
  await host.emit('pointerdown', { button: 0, pointerId: 12, clientX: 0, clientY: 0, preventDefault() {} });
  assert.equal(f.window.listenerCount('beforeunload'), 1, 'capture requires protection before the begin reply');
  await settle();
  await host.emit('pointermove', { pointerId: 12, clientX: .05, clientY: 0 }); await settle();
  await f.document.emit('keydown', { key: 'Escape' }); await settle();
  assert.equal(host.hasPointerCapture(12), false);
  assert.equal(f.node('save-status').dataset.state, 'saved');
  assert.equal(f.window.listenerCount('beforeunload'), 0);
  await f.nudge(); f.failWorker(); await settle();
  assert.equal(f.node('save-status').dataset.state, 'unsaved');
  assert.match(f.node('save-status').textContent, /中断.*未保存/);
  assert.equal((await f.beforeUnload()).defaultPrevented, true);
  await f.clickLink('./overview.html');
  assert.equal(f.node('leave-save').disabled, true);
  assert.equal(f.node('leave-discard').disabled, false);
  f.setNavigationFailure(); await f.node('leave-discard').click(); await settle();
  assert.deepEqual(f.navigations, []);
  assert.equal(f.window.listenerCount('beforeunload'), 1, 'synchronous navigation failure restores protection');
  assert.match(f.node('toast').textContent, /fixture-navigation-refused/);
  assert.deepEqual(f.writes, []);
});
