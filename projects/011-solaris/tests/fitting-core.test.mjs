import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSION, AVATAR_ID, MAX_FILE_BYTES, MAX_HISTORY, GARMENTS, SHOES, COLORS, POSES, VIEWS, CAMERA_LIMITS,
  initialState, validateState, parseState, serializeState, cameraForView, validateCamera,
  wearGarment, removeGarment, setColor, wearShoes, removeShoes, setShoeColor,
  setPose, setView, setCamera, resetState, History,
} from '../web/fitting/core.js';

const copy = value => structuredClone(value);
const customCamera = { position: [2.17364518273456, 1.712340098721, -3.895670987123], target: [.1245678991234, 1.172340898723, -.084567098123] };

test('registered fixed-body inspection choices are closed, immutable and serializable without a garment', () => {
  assert.deepEqual(GARMENTS.map(item => item.id), ['tee-01', 'jacket-01']);
  assert.deepEqual(COLORS.map(item => item.id), ['ivory', 'moss', 'ink']);
  assert.deepEqual(POSES.map(item => item.id), ['neutral', 'reach']);
  const state = initialState();
  assert.equal(state.version, VERSION); assert.equal(state.avatarId, AVATAR_ID); assert.equal(state.garment, null); assert.equal(state.shoes, null);
  assert.deepEqual(parseState(serializeState(state)), state);
  assert.throws(() => GARMENTS.push({ id: 'other' }), TypeError);
  assert.throws(() => { VIEWS.hero.position[0] = 99; }, TypeError);
  state.camera.position[0] = 0;
  assert.equal(initialState().camera.position[0], 3.1, 'new workspaces cannot alter registered presets');
});

test('wear, replace, recolor and remove retain the fixed body, exact camera and frozen pose', () => {
  const baseline = setCamera(setPose(initialState(), 'reach'), customCamera), source = copy(baseline);
  const tee = wearGarment(baseline, 'tee-01', 'moss');
  const jacket = wearGarment(tee, 'jacket-01', 'ink');
  assert.deepEqual(jacket.garment, { id: 'jacket-01', color: 'ink' });
  for (const state of [tee, jacket, setColor(jacket, 'ivory'), removeGarment(jacket)]) {
    assert.equal(state.avatarId, AVATAR_ID); assert.equal(state.pose, 'reach'); assert.equal(state.view, 'custom');
    assert.deepEqual(state.camera, customCamera);
    assert.deepEqual(parseState(serializeState(state)), state);
  }
  assert.deepEqual(baseline, source, 'commands must not mutate the previous workspace');
  assert.equal(removeGarment(jacket).garment, null);
  assert.throws(() => setColor(baseline, 'moss'), /请先穿上/);
});

test('invalid imports cannot add bodies, garments, sizes, cloth phases or shopping fields', () => {
  const base = wearGarment(initialState(), 'tee-01', 'ivory');
  const variants = [
    { ...base, version: '1' }, { ...base, version: 3 }, { ...base, avatarId: 'another-body' },
    { ...base, garment: { id: 'shoe-01', color: 'ivory' } },
    { ...base, garment: { id: 'tee-01', color: 'red' } },
    { ...base, garment: [base.garment, { id: 'jacket-01', color: 'ink' }] },
    { ...base, garment: { ...base.garment, size: 'M' } },
    { ...base, garment: { ...base.garment, fabricPhysics: true } },
    { ...base, garment: undefined }, { ...base, pose: 'animated' }, { ...base, phase: .5 },
    { ...base, cart: [] }, { ...base, selected: 'jacket-01' }, { ...base, view: 'side' },
  ];
  for (const state of variants) assert.throws(() => validateState(state));
  assert.deepEqual(base.garment, { id: 'tee-01', color: 'ivory' });
});

test('strict objects reject inherited, hidden, symbol and accessor values without invoking getters', () => {
  let reads = 0;
  const accessed = initialState();
  Object.defineProperty(accessed, 'garment', { enumerable: true, get() { reads++; return null; } });
  const cameraAccessed = initialState();
  Object.defineProperty(cameraAccessed.camera, 'position', { enumerable: true, get() { reads++; return [0, 1, 4]; } });
  const hidden = initialState(); Object.defineProperty(hidden, 'pose', { value: 'neutral', enumerable: false });
  const inherited = Object.assign(Object.create({ bodySize: 1 }), initialState());
  const nullProto = Object.assign(Object.create(null), initialState());
  const symbolic = initialState(); symbolic[Symbol('outside-schema')] = 1;
  for (const state of [accessed, cameraAccessed, hidden, inherited, nullProto, symbolic]) assert.throws(() => validateState(state));
  assert.equal(reads, 0, 'validation cannot execute imported accessors');
  const nested = wearGarment(initialState(), 'tee-01');
  Object.setPrototypeOf(nested.garment, { price: 0 }); assert.throws(() => validateState(nested));
});

test('camera vectors reject sparse, decorated, inherited and accessor coordinates without coercion', () => {
  let reads = 0;
  const sparse = []; sparse.length = 3; sparse[0] = 3; sparse[2] = 5;
  const decorated = [3, 2, 5]; decorated.unit = 'm';
  const inherited = [3, 2, 5]; Object.setPrototypeOf(inherited, Object.create(Array.prototype));
  const getter = [3, 2, 5]; Object.defineProperty(getter, '1', { enumerable: true, get() { reads++; return 2; } });
  for (const position of [sparse, decorated, inherited, getter, [3, '2', 5], [3, NaN, 5], [3, Infinity, 5], [3, 2], new Float32Array([3, 2, 5])])
    assert.throws(() => validateCamera({ position, target: [0, .95, 0] }));
  assert.equal(reads, 0);
});

test('all registered camera views remain within the same finite observation limits as custom cameras', () => {
  for (const id of Object.keys(VIEWS)) {
    const state = setView(wearGarment(initialState(), 'jacket-01', 'moss'), id);
    assert.deepEqual(validateCamera(cameraForView(id)), state.camera);
    assert.equal(state.view, id); assert.equal(state.garment.id, 'jacket-01');
    assert.deepEqual(parseState(serializeState(state)), state);
  }
  const free = setCamera(initialState(), customCamera);
  assert.equal(free.view, 'custom'); assert.deepEqual(free.camera, customCamera);
  assert.throws(() => validateState({ ...free, view: 'hero' }), /不一致/);
  assert.throws(() => cameraForView('custom'), /未登记/);
  assert.throws(() => cameraForView('__proto__'), /未登记/);
  assert.throws(() => setPose(free, '__proto__'), /未登记/);
});

test('custom cameras enforce distance, vertical extent, target extent and viewing-angle bounds', () => {
  const target = [0, 1, 0], limits = CAMERA_LIMITS;
  for (const distance of [limits.minDistance, limits.maxDistance])
    assert.deepEqual(validateCamera({ position: [0, 1, distance], target }).target, target);
  for (const angle of [limits.minPolar, limits.maxPolar])
    assert.doesNotThrow(() => validateCamera({ position: [3 * Math.sin(angle), 1 + 3 * Math.cos(angle), 0], target }));
  for (const camera of [
    { position: [0, 1, limits.minDistance - 1e-6], target },
    { position: [0, 1, limits.maxDistance + 1e-6], target },
    { position: [0, 1, 0], target }, { position: [0, 3, 0], target },
    { position: [0, .2, 3], target }, { position: [0, .1, 3], target },
    { position: [0, 8, 3], target }, { position: [13, 1, 3], target },
    { position: [2, 2, 4], target: [0, 0, 0] }, { position: [2, 2, 4], target: [1.21, 1, 0] },
  ]) assert.throws(() => validateCamera(camera));
});

test('raw JSON has an independent UTF-8 32 KiB boundary and rejects malformed content', () => {
  const text = serializeState(setCamera(wearGarment(initialState(), 'jacket-01', 'ink'), customCamera));
  const atLimit = text + ' '.repeat(MAX_FILE_BYTES - new TextEncoder().encode(text).byteLength);
  assert.equal(new TextEncoder().encode(atLimit).byteLength, MAX_FILE_BYTES);
  assert.deepEqual(parseState(atLimit), parseState(text));
  assert.throws(() => parseState(atLimit + ' '), /32 KiB/);
  const utf8 = JSON.stringify({ ...initialState(), note: '衣'.repeat(12000) });
  assert.ok(utf8.length < MAX_FILE_BYTES); assert.ok(new TextEncoder().encode(utf8).byteLength > MAX_FILE_BYTES);
  assert.throws(() => parseState(utf8), /32 KiB/);
  for (const invalid of [null, undefined, new Uint8Array(), '{', 'null', '[]', '{}', '\uFEFF' + text])
    assert.throws(() => parseState(invalid));
});

test('multi-round fitting, static pose and camera inspection undo and redo as exact complete workspaces', () => {
  const history = new History(), states = [copy(history.current)];
  const commands = [
    state => wearGarment(state, 'tee-01', 'ivory'), state => setColor(state, 'moss'),
    state => setPose(state, 'reach'), state => setView(state, 'back'),
    state => wearGarment(state, 'jacket-01', 'ink'), state => setCamera(state, customCamera),
    state => removeGarment(state),
  ];
  commands.forEach((command, i) => { assert.equal(history.edit(`检查 ${i + 1}`, command), true); states.push(copy(history.current)); });
  for (let i = states.length - 2; i >= 0; i--) { assert.equal(history.undo(), true); assert.deepEqual(history.current, states[i]); }
  assert.equal(history.undo(), false);
  for (let i = 1; i < states.length; i++) { assert.equal(history.redo(), true); assert.deepEqual(history.current, states[i]); }
  assert.equal(history.redo(), false);
  assert.deepEqual(parseState(serializeState(history.current)), states.at(-1));
});

test('same item and color, same pose, empty removal and unchanged camera create no history and retain redo', () => {
  const history = new History();
  assert.equal(history.edit('空上装脱下', removeGarment), false); assert.equal(history.past.length, 0);
  history.edit('穿上短袖', state => wearGarment(state, 'tee-01', 'ivory'));
  history.edit('换夹克', state => wearGarment(state, 'jacket-01', 'ink'));
  history.undo(); const future = copy(history.future);
  for (const command of [state => wearGarment(state, 'tee-01', 'ivory'), state => setColor(state, 'ivory'),
    state => setPose(state, 'neutral'), state => setView(state, 'hero')]) {
    assert.equal(history.edit('未变化', command), false); assert.equal(history.past.length, 1);
    assert.deepEqual(history.future, future);
  }
  assert.equal(history.redo(), true); assert.equal(history.current.garment.id, 'jacket-01');
});

test('gesture cancellation and pending undo/redo restore the whole baseline without consuming previous history', () => {
  const history = new History(wearGarment(initialState(), 'tee-01', 'moss'));
  history.edit('抬臂', state => setPose(state, 'reach')); history.edit('背面', state => setView(state, 'back'));
  history.undo(); const baseline = copy(history.current), past = copy(history.past), future = copy(history.future);
  for (const command of ['cancel', 'undo', 'redo']) {
    assert.equal(history.begin('完整拖换衣事务'), true); assert.equal(history.begin('不能嵌套'), false);
    history.current = setCamera(setPose(wearGarment(history.current, 'jacket-01', 'ink'), 'neutral'), customCamera);
    assert.equal(history.canUndo, true); assert.equal(history.canRedo, true);
    assert.equal(history[command](), true); assert.deepEqual(history.current, baseline);
    assert.deepEqual(history.past, past); assert.deepEqual(history.future, future); assert.equal(history.pending, null);
  }
  assert.equal(history.redo(), true); assert.equal(history.current.view, 'back');
});

test('a complete legal preview is one undo item while invalid edits and failed commits atomically roll back', () => {
  const history = new History(), baseline = copy(history.current);
  history.begin('拖放合法夹克');
  history.current = setPose(wearGarment(history.current, 'jacket-01', 'moss'), 'reach');
  history.current = setView(history.current, 'detail');
  const preview = copy(history.current); assert.equal(history.commit(), true); assert.equal(history.past.length, 1);
  assert.equal(history.undo(), true); assert.deepEqual(history.current, baseline);
  assert.equal(history.redo(), true); assert.deepEqual(history.current, preview);
  const before = copy(history.current), past = copy(history.past);
  assert.throws(() => history.edit('非法颜色', state => { state.pose = 'neutral'; state.garment.color = 'red'; }), /未登记/);
  assert.deepEqual(history.current, before); assert.deepEqual(history.past, past); assert.equal(history.pending, null);
  history.begin('损坏预览'); history.current.camera.position[0] = NaN;
  assert.throws(() => history.commit(), /有限数值/); assert.deepEqual(history.current, before); assert.deepEqual(history.past, past);
  history.begin('正在拖动'); assert.throws(() => history.edit('重入', removeGarment), /请先完成/); history.cancel();
});

test('new accepted edits branch history while import replacement clears history only after complete validation', () => {
  const history = new History();
  history.run('短袖', state => wearGarment(state, 'tee-01', 'moss'));
  history.run('夹克', state => wearGarment(state, 'jacket-01', 'ink')); history.undo();
  history.run('抬臂', state => setPose(state, 'reach')); assert.equal(history.future.length, 0); assert.equal(history.redo(), false);
  history.begin('未完成拖动');
  const baseline = { current: copy(history.current), past: copy(history.past), pending: copy(history.pending) };
  assert.throws(() => history.replace({ ...history.current, avatarId: 'invalid' }), /未登记/);
  assert.deepEqual({ current: history.current, past: history.past, pending: history.pending }, baseline);
  const imported = setCamera(wearGarment(initialState(), 'jacket-01', 'ivory'), customCamera);
  history.replace(parseState(serializeState(imported)));
  assert.deepEqual(history.current, imported); assert.equal(history.past.length, 0); assert.equal(history.future.length, 0);
  assert.equal(history.pending, null); assert.equal(history.canUndo, false); assert.equal(history.canRedo, false);
});

test('history keeps the most recent 40 whole workspaces and all retained states can be restored', () => {
  const history = new History(), states = [copy(history.current)];
  for (let i = 0; i < 47; i++) {
    history.edit(`试衣 ${i + 1}`, state => wearGarment(state, i % 2 ? 'jacket-01' : 'tee-01', COLORS[i % 3].id));
    states.push(copy(history.current));
  }
  assert.equal(history.past.length, MAX_HISTORY);
  let undoCount = 0; while (history.undo()) undoCount++;
  assert.equal(undoCount, 40); assert.deepEqual(history.current, states[7]);
  let redoCount = 0; while (history.redo()) redoCount++;
  assert.equal(redoCount, 40); assert.deepEqual(history.current, states.at(-1));
  for (const invalid of [0, 41, 1.5, NaN, '40']) assert.throws(() => new History(initialState(), invalid));
});

test('reset restores the empty original body, neutral pose and overview as one undoable change', () => {
  const configured = setCamera(setPose(wearShoes(wearGarment(initialState(), 'jacket-01', 'ink'), 'boot-01', 'moss'), 'reach'), customCamera);
  const history = new History(configured);
  assert.equal(history.edit('重置试衣间', resetState), true); assert.deepEqual(history.current, initialState());
  assert.equal(history.undo(), true); assert.deepEqual(history.current, configured);
  assert.equal(history.redo(), true); assert.deepEqual(history.current, initialState());
  assert.equal(history.edit('重复重置', resetState), false);
  assert.throws(() => resetState({ ...configured, avatarId: 'another' }), /未登记/);
});

const legacyV1 = state => {
  const next = copy(state); next.version = 1; delete next.shoes; return next;
};

test('strict v1 migration adds only an empty shoe slot and version 2 while preserving all original choices and precision', () => {
  const free = setCamera(setPose(wearGarment(initialState(), 'jacket-01', 'moss'), 'reach'), customCamera);
  for (const state of [initialState(), free, ...['hero', 'front', 'back', 'detail'].map(id => setView(free, id))]) {
    const legacy = legacyV1(state), text = JSON.stringify(legacy), migrated = parseState(text);
    assert.equal(migrated.version, 2); assert.equal(migrated.shoes, null);
    const projected = copy(migrated); projected.version = 1; delete projected.shoes;
    assert.deepEqual(projected, legacy, 'legacy fields must survive unchanged, including exact custom camera numbers');
    assert.deepEqual(migrated.camera, legacy.camera);
    assert.equal(JSON.stringify(legacy), text, 'migration must not mutate the old input');
    assert.deepEqual(parseState(serializeState(migrated)), migrated);
    assert.throws(() => validateState(legacy), /结构无效/);
    assert.throws(() => serializeState(legacy), /结构无效/);
  }
});

test('legacy migration keeps the original closed schema, preset agreement and raw 32 KiB file limit', () => {
  const legacy = legacyV1(wearGarment(initialState(), 'tee-01', 'ink'));
  const invalid = [
    { ...legacy, shoes: null }, { ...legacy, shoes: { id: 'court-01', color: 'ivory' } },
    { ...legacy, cart: [] }, { ...legacy, phase: .5 }, { ...legacy, avatarId: 'other-body' },
    { ...legacy, garment: { id: 'tee-01', color: 'red' } },
    { ...legacy, garment: { id: 'tee-01', color: 'ink', size: 'M' } },
    { ...legacy, view: 'shoe-detail', camera: cameraForView('shoe-detail') },
    { ...legacy, view: 'front', camera: cameraForView('back') },
    { ...legacy, camera: { position: [0, null, 5], target: [0, .95, 0] } },
  ];
  for (const value of invalid) assert.throws(() => parseState(JSON.stringify(value)));
  assert.throws(() => parseState(JSON.stringify(legacy).replace('"pose":"neutral"', '"__proto__":{"size":"M"},"pose":"neutral"')), /结构无效/);
  const text = JSON.stringify(legacy), padded = text + ' '.repeat(MAX_FILE_BYTES - Buffer.byteLength(text));
  assert.deepEqual(parseState(padded), parseState(text));
  assert.throws(() => parseState(padded + ' '), /32 KiB/);
  for (const version of [0, 3, '1']) assert.throws(() => parseState(JSON.stringify({ ...legacy, version })));
});

test('shoe commands replace a complete registered pair independently of the garment, frozen body and exact camera', () => {
  assert.deepEqual(SHOES.map(item => item.id), ['court-01', 'boot-01']);
  assert.throws(() => { SHOES[0].id = 'single-foot'; }, TypeError);
  const baseline = setCamera(setPose(wearGarment(initialState(), 'jacket-01', 'moss'), 'reach'), customCamera), source = copy(baseline);
  const court = wearShoes(baseline, 'court-01'), boot = wearShoes(court, 'boot-01', 'ink');
  assert.deepEqual(court.shoes, { id: 'court-01', color: 'ivory' });
  assert.deepEqual(boot.shoes, { id: 'boot-01', color: 'ink' });
  for (const state of [court, boot, setShoeColor(boot, 'moss'), removeShoes(boot)]) {
    assert.deepEqual(state.garment, baseline.garment); assert.equal(state.pose, baseline.pose);
    assert.equal(state.avatarId, baseline.avatarId); assert.equal(state.view, baseline.view); assert.deepEqual(state.camera, customCamera);
    assert.deepEqual(parseState(serializeState(state)), state);
  }
  for (const state of [wearGarment(boot, 'tee-01', 'ivory'), setColor(boot, 'ivory'), removeGarment(boot)])
    assert.deepEqual(state.shoes, boot.shoes, 'upper-slot commands cannot change either shoe');
  assert.deepEqual(baseline, source);
  assert.throws(() => setShoeColor(initialState(), 'moss'), /请先穿上一双鞋/);
  assert.equal(removeShoes(baseline).shoes, null);
});

test('v2 shoes reject unknown IDs, partial pairs, size, gait, shopping and extra data before accepting a workspace', () => {
  const base = wearShoes(wearGarment(initialState(), 'tee-01', 'ivory'), 'court-01', 'moss');
  const invalidSlots = [
    undefined, [], [{ id: 'court-01', color: 'moss' }], 'court-01',
    { id: 'tee-01', color: 'moss' }, { id: 'unregistered-shoe', color: 'moss' },
    { id: 'court-01', color: 'red' }, { id: 'court-01' },
    { id: 'court-01', color: 'moss', left: true },
    { id: 'court-01', color: 'moss', rightId: 'boot-01' },
    { id: 'court-01', color: 'moss', size: 42 },
    { id: 'court-01', color: 'moss', gait: 'walking' },
    { id: 'court-01', color: 'moss', quantity: 2 },
  ];
  for (const shoes of invalidSlots) assert.throws(() => validateState({ ...base, shoes }));
  const omitted = copy(base); delete omitted.shoes; assert.throws(() => validateState(omitted), /结构无效/);
  for (const extra of [{ cart: [] }, { shoeSize: 42 }, { gait: 'walk' }, { footContact: true }])
    assert.throws(() => parseState(JSON.stringify({ ...base, ...extra })), /结构无效/);
  assert.throws(() => wearShoes(base, '__proto__'), /未登记/);
  assert.throws(() => setShoeColor(base, 'red'), /鞋履面料颜色未登记/);
});

test('shoe slots reject accessors, hidden fields, custom prototypes and symbols without invoking code', () => {
  const base = wearShoes(initialState(), 'boot-01', 'ink'); let reads = 0;
  const accessed = copy(base);
  Object.defineProperty(accessed, 'shoes', { enumerable: true, get() { reads++; return base.shoes; } });
  const accessedId = copy(base);
  Object.defineProperty(accessedId.shoes, 'id', { enumerable: true, get() { reads++; return 'boot-01'; } });
  const hiddenColor = copy(base); Object.defineProperty(hiddenColor.shoes, 'color', { value: 'ink', enumerable: false });
  const symbolic = copy(base); symbolic.shoes[Symbol('size')] = 42;
  const inherited = copy(base); Object.setPrototypeOf(inherited.shoes, { gait: 'walk' });
  const nullProto = copy(base); Object.setPrototypeOf(nullProto.shoes, null);
  for (const value of [accessed, accessedId, hiddenColor, symbolic, inherited, nullProto]) assert.throws(() => validateState(value));
  assert.equal(reads, 0);
});

test('multi-round outfit inspection restores both independent slots, static pose and camera in exact undo/redo order', () => {
  const history = new History(), states = [copy(history.current)];
  const commands = [
    state => wearGarment(state, 'tee-01', 'moss'), state => wearShoes(state, 'court-01', 'ivory'),
    state => setShoeColor(state, 'ink'), state => wearGarment(state, 'jacket-01', 'ink'),
    state => setPose(state, 'reach'), state => wearShoes(state, 'boot-01', 'moss'),
    state => setView(state, 'shoe-detail'), state => removeGarment(state), state => removeShoes(state),
  ];
  for (const [i, command] of commands.entries()) { assert.equal(history.edit(`搭配检查 ${i + 1}`, command), true); states.push(copy(history.current)); }
  assert.equal(history.past.length, commands.length);
  for (let i = states.length - 2; i >= 0; i--) { assert.equal(history.undo(), true); assert.deepEqual(history.current, states[i]); }
  for (let i = 1; i < states.length; i++) { assert.equal(history.redo(), true); assert.deepEqual(history.current, states[i]); }
  assert.deepEqual(parseState(serializeState(history.current)), states.at(-1));
});

test('a cancelled or invalid shoe preview restores the whole dressed baseline and preserves preceding history', () => {
  const history = new History(wearShoes(wearGarment(initialState(), 'tee-01', 'moss'), 'court-01', 'ivory'));
  history.edit('检查姿态', state => setPose(state, 'reach'));
  history.edit('检查脚部', state => setView(state, 'shoe-detail')); history.undo();
  const baseline = copy(history.current), past = copy(history.past), future = copy(history.future);
  for (const cancel of ['cancel', 'undo', 'redo']) {
    history.begin('拖动成对短靴');
    history.current = setCamera(setPose(wearShoes(history.current, 'boot-01', 'ink'), 'neutral'), customCamera);
    assert.equal(history[cancel](), true); assert.deepEqual(history.current, baseline);
    assert.deepEqual(history.past, past); assert.deepEqual(history.future, future);
  }
  history.begin('损坏成对鞋预览'); history.current = wearShoes(history.current, 'boot-01', 'moss'); history.current.shoes.rightId = 'court-01';
  assert.throws(() => history.commit(), /成对鞋履结构无效/);
  assert.deepEqual(history.current, baseline); assert.deepEqual(history.past, past); assert.deepEqual(history.future, future);
  assert.throws(() => history.edit('坏鞋色', state => { state.garment.color = 'ink'; state.shoes.color = 'red'; }), /未登记/);
  assert.deepEqual(history.current, baseline); assert.equal(history.pending, null);
});

test('same shoe pair and color are no-ops that preserve redo while another color is a separate reversible change', () => {
  const history = new History(wearGarment(initialState(), 'jacket-01', 'moss'));
  assert.equal(history.edit('未穿鞋脱下', removeShoes), false); assert.equal(history.past.length, 0);
  history.edit('低帮鞋', state => wearShoes(state, 'court-01', 'ivory'));
  history.edit('短靴', state => wearShoes(state, 'boot-01', 'ink')); history.undo();
  const future = copy(history.future);
  for (const command of [state => wearShoes(state, 'court-01', 'ivory'), state => setShoeColor(state, 'ivory')]) {
    assert.equal(history.edit('同鞋同色', command), false); assert.equal(history.past.length, 1); assert.deepEqual(history.future, future);
  }
  assert.equal(history.edit('同鞋不同色', state => wearShoes(state, 'court-01', 'moss')), true);
  assert.equal(history.future.length, 0); assert.deepEqual(history.current.garment, { id: 'jacket-01', color: 'moss' });
  assert.equal(history.undo(), true); assert.deepEqual(history.current.shoes, { id: 'court-01', color: 'ivory' });
});

test('foot-detail is an exact new registered view while old custom cameras retain the existing finite inspection domain', () => {
  const dressed = wearShoes(wearGarment(initialState(), 'tee-01', 'moss'), 'boot-01', 'ink');
  const detail = setView(dressed, 'shoe-detail');
  assert.deepEqual(detail.camera, { position: [1.05, .5, 1.65], target: [0, .2, .05] });
  assert.deepEqual(validateCamera(detail.camera), detail.camera); assert.deepEqual(detail.garment, dressed.garment); assert.deepEqual(detail.shoes, dressed.shoes);
  assert.deepEqual(parseState(serializeState(detail)), detail);
  const legacyCustom = legacyV1(setCamera(dressed, detail.camera));
  assert.deepEqual(parseState(JSON.stringify(legacyCustom)).camera, detail.camera, 'v1 custom cameras keep their original legal range; only preset labels are version-specific');
  assert.throws(() => parseState(JSON.stringify({ ...legacyCustom, view: 'shoe-detail' })), /未登记/);
  assert.throws(() => validateState({ ...detail, camera: cameraForView('detail') }), /不一致/);
});

test('opening a v1 upper-only setup is one reversible full-workspace import without inventing prior footwear', () => {
  const dressed = setView(wearShoes(wearGarment(initialState(), 'tee-01', 'ivory'), 'boot-01', 'ink'), 'shoe-detail');
  const legacy = legacyV1(setCamera(setPose(wearGarment(initialState(), 'jacket-01', 'moss'), 'reach'), customCamera));
  const migrated = parseState(JSON.stringify(legacy)), history = new History(dressed);
  assert.equal(history.edit('打开旧版搭配', () => migrated), true); assert.equal(history.past.length, 1);
  assert.equal(history.current.shoes, null); assert.deepEqual(history.current.garment, legacy.garment);
  assert.deepEqual(history.current.camera, customCamera); assert.equal(history.current.pose, 'reach');
  assert.equal(history.undo(), true); assert.deepEqual(history.current, dressed);
  assert.equal(history.redo(), true); assert.deepEqual(history.current, migrated);
  const pending = copy(history.current); history.begin('导入中损坏预览');
  assert.throws(() => history.replace({ ...migrated, shoes: { id: 'single-left', color: 'ivory' } }), /未登记/);
  assert.deepEqual(history.current, pending); assert.ok(history.pending); history.cancel();
});
