import test from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, MAX_ITEMS, BOWL, INGREDIENTS, VIEWS, clone, initialState, validateState, cameraForView, canDrop, makeItem, addItem, removeItem, beginInspection, inspectionPose, History } from '../web/kitchen/core.js';

const pose = (position = [0, .3, 0]) => ({ position, quaternion: [0, 0, 0, 1] });

test('the four registered ingredients and every camera preset round trip without shared mutable poses', () => {
  const original = initialState();
  assert.equal(original.version, VERSION); assert.equal(original.items.length, 4);
  assert.deepEqual(new Set(original.items.map(item => item.templateId)), new Set(INGREDIENTS.map(item => item.id)));
  for (const view of Object.keys(VIEWS)) {
    const state = { ...original, camera: cameraForView(view), view };
    assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), state);
  }
  const saved = validateState(original);
  saved.items[0].position[0] = 0;
  saved.camera.target[0] = 0;
  assert.notDeepEqual(saved, original);
  assert.deepEqual(initialState(), original);
  assert.throws(() => cameraForView('custom'));
});

test('drop targets use the registered sphere envelope, independently of finite drop height and settled tolerance', () => {
  for (const ingredient of INGREDIENTS) {
    assert.equal(canDrop(ingredient.id, [BOWL.innerRadius - ingredient.radius, BOWL.dropPlaneY, 0]), true);
    assert.equal(canDrop(ingredient.id, [BOWL.innerRadius - ingredient.radius + .0001, .2, 0]), false);
    assert.equal(canDrop(ingredient.id, [0, -100, 0]), true);
    assert.equal(canDrop(ingredient.id, [.3, .62, .3]), false);
  }
  assert.throws(() => canDrop('remote-asset', [0, .62, 0]));
  assert.throws(() => canDrop('apple', [0, NaN, 0]));
  assert.throws(() => canDrop('apple', [0, .62]));
  const state = initialState();
  state.items[1].position = [.43 - .085, .185, 0];
  assert.deepEqual(validateState(state), state);
  assert.equal(canDrop('apple', state.items[1].position), false);
});

test('backups reject registry injection, duplicate or reused IDs, nonfinite values and out-of-bowl poses', () => {
  const corruptions = [
    state => { state.version = 2; },
    state => { state.registry = INGREDIENTS; },
    state => { state.inspection = {}; },
    state => { state.nextId = 2; },
    state => { state.nextId = 5.1; },
    state => { state.items[0].id = 'ingredient-01'; },
    state => { state.items[0].id = state.items[1].id; },
    state => { state.items[0].templateId = 'constructor'; },
    state => { state.items[0].mass = 500; },
    state => { state.items[0].position[0] = Infinity; },
    state => { state.items[0].position[0] = .36; },
    state => { state.items[0].position[1] = .162; },
    state => { state.items[0].position[1] = .701; },
    state => { delete state.items[0].position[0]; },
    state => { state.items[0].position.extra = true; },
    state => { state.items[0].quaternion = [0, 0, 0, .9]; },
    state => { state.items[0].quaternion[0] = NaN; },
    state => { delete state.items[0]; },
    state => { state.items.custom = true; },
    state => { state.view = 'unknown'; },
    state => { state.camera.target[1] = 1.21; },
    state => { state.camera.position = [0, .18, 0]; },
    state => { state.camera.position[1] = 5.1; },
    state => { state.camera.position = [1, .2, 1]; },
    state => { state[Symbol('hidden')] = true; },
  ];
  for (const corrupt of corruptions) {
    const state = initialState(); corrupt(state);
    assert.throws(() => validateState(state));
  }
  assert.throws(() => validateState(Object.assign(Object.create({ backend: true }), initialState())));
  const tolerance = initialState(); tolerance.items[0].quaternion = [0, 0, 0, 1 + 5e-6];
  assert.deepEqual(validateState(tolerance), tolerance);
  tolerance.items[0].quaternion[3] = 1 + 2e-5;
  assert.throws(() => validateState(tolerance));
});

test('adding and removing keeps stable instance IDs and refuses the seventeenth ingredient atomically', () => {
  const original = initialState(), draft = makeItem(original, 'apple', pose());
  assert.equal(draft.id, 'ingredient-5'); assert.deepEqual(original, initialState());
  let state = addItem(original, 'apple', pose());
  state = removeItem(state, 'ingredient-5');
  assert.equal(state.nextId, 6);
  state = addItem(state, 'lemon', pose());
  assert.equal(state.items.at(-1).id, 'ingredient-6');
  while (state.items.length < MAX_ITEMS) state = addItem(state, 'onion', pose());
  const before = clone(state);
  assert.throws(() => addItem(state, 'onion', pose()), /最多/);
  assert.deepEqual(state, before);
  assert.throws(() => removeItem(state, 'ingredient-999'));
});

test('inspection is an independent reversible vertical curve that preserves orientation and all saved poses', () => {
  const state = initialState();
  state.items[1].quaternion = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)];
  const before = clone(state);
  const session = beginInspection(state, 'ingredient-2');
  assert.deepEqual(inspectionPose(session, 0), { position: before.items[1].position, quaternion: before.items[1].quaternion });
  const raised = inspectionPose(session, 1);
  assert.equal(raised.position[1], .85);
  assert.equal(raised.position[0], before.items[1].position[0]);
  assert.equal(raised.position[2], before.items[1].position[2]);
  assert.deepEqual(raised.quaternion, before.items[1].quaternion);
  let last = before.items[1].position[1];
  for (let step = 0; step <= 20; step++) {
    const current = inspectionPose(session, step / 20);
    assert.ok(current.position[1] >= last); last = current.position[1];
    assert.ok(current.position[1] <= .85);
  }
  assert.deepEqual(inspectionPose(session, 0), session.originalPose);
  assert.deepEqual(state, before);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))), before);
  session.originalPose.position[0] = 0;
  assert.deepEqual(state, before);
  for (const invalid of [-.01, 1.01, NaN, '0.5']) assert.throws(() => inspectionPose(beginInspection(state, 'ingredient-2'), invalid));
  assert.throws(() => beginInspection(state, 'ingredient-99'));
});

test('vertical sphere sweep rejects a trapped ingredient but permits tangent neighbours and topmost items', () => {
  const state = initialState();
  state.items = [
    { id: 'ingredient-1', templateId: 'apple', ...pose([0, .185, 0]) },
    { id: 'ingredient-2', templateId: 'apple', ...pose([0, .355, 0]) },
  ];
  state.nextId = 3;
  assert.throws(() => beginInspection(state, 'ingredient-1'), /阻挡/);
  assert.doesNotThrow(() => beginInspection(state, 'ingredient-2'));
  state.items[1].position = [.17, .355, 0];
  assert.doesNotThrow(() => beginInspection(state, 'ingredient-1'));
  state.items[1].position = [.169, .355, 0];
  assert.throws(() => beginInspection(state, 'ingredient-1'), /阻挡/);
  state.items[1].position = [0, .18, 0];
  assert.doesNotThrow(() => beginInspection(state, 'ingredient-1'));
});

test('one drag and settling transaction produces one undo, while invalid final physics state rolls everything back', () => {
  const history = new History(), before = clone(history.current);
  history.begin('投入苹果');
  history.current = addItem(history.current, 'apple', pose([.24, .62, 0]));
  const item = history.current.items.at(-1);
  for (const y of [.5, .35, .22, .185]) item.position[1] = y;
  assert.equal(history.begin('重复指针事件'), false);
  assert.equal(history.commit(), true); assert.equal(history.past.length, 1);
  const settled = clone(history.current);
  history.undo(); assert.deepEqual(history.current, before);
  history.redo(); assert.deepEqual(history.current, settled);
  history.begin('移出容器的坏状态'); history.current.items[0].position = [2, .18, 0];
  assert.throws(() => history.commit());
  assert.deepEqual(history.current, settled); assert.equal(history.pending, null);
  assert.equal(history.past.length, 1);
  history.begin('取消拖放'); history.current.items[0].position = [0, .62, 0];
  history.cancel(); assert.deepEqual(history.current, settled);
});

test('camera and ingredient edits undo independently, failed restore is atomic, and history is bounded', () => {
  const history = new History();
  history.run('碗中俯视', state => ({ ...state, view: 'top', camera: cameraForView('top') }));
  const camera = clone(history.current.camera);
  history.run('移除苹果', state => removeItem(state, 'ingredient-2'));
  assert.deepEqual(history.current.camera, camera);
  history.undo(); assert.equal(history.current.items.length, 4); assert.deepEqual(history.current.camera, camera);
  history.edit('另一次编辑', state => { state.view = 'bowl'; state.camera = cameraForView('bowl'); });
  assert.equal(history.redo(), false);
  const before = clone(history.current);
  history.begin('移动食材'); history.current.items[0].position[1] = .3;
  const pending = clone(history.current);
  assert.throws(() => history.replace({ ...initialState(), version: 2 }));
  assert.deepEqual(history.current, pending); assert.ok(history.pending);
  assert.throws(() => history.edit('嵌套', () => {}));
  history.cancel(); assert.deepEqual(history.current, before);
  assert.throws(() => history.edit('失败加载', state => { state.items.pop(); throw new Error('asset failed'); }));
  assert.deepEqual(history.current, before);
  history.replace(initialState());
  assert.equal(history.past.length, 0); assert.equal(history.future.length, 0);
  for (let index = 0; index < 45; index++) history.edit('移动已落稳食材', state => { state.items[0].position[0] = index % 2 ? -.1 : -.15; });
  assert.equal(history.past.length, 40);
});
