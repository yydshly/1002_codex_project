import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_IDS, PRODUCTS, SCENES, SCENE_TASKS, initialState, validateState, swapProducts, togglePin,
  toggleWishlist, selectProduct, planPreference, applyPreference, resolveIntent, validateCheckpoint, History,
} from '../web/collection/core.js';

test('six registered design assets and round-tripped state keep independent lists', () => {
  const state = initialState(), original = JSON.stringify(state);
  const copy = validateState(JSON.parse(original));
  assert.deepEqual(copy.order, PRODUCT_IDS);
  assert.deepEqual(Object.keys(PRODUCTS), PRODUCT_IDS);
  assert.equal(copy.selected, 'chair');
  for (const id of PRODUCT_IDS) {
    assert.equal(PRODUCTS[id].id, id);
    assert.equal(PRODUCTS[id].license, 'CC0');
    assert.equal(PRODUCTS[id].sourceUrl, `https://polyhaven.com/a/${PRODUCTS[id].model}`);
    assert.ok(Object.isFrozen(PRODUCTS[id].tags));
    assert.equal(Object.hasOwn(PRODUCTS[id], 'price'), false);
  }
  copy.order.reverse(); copy.wishlist.push('lamp');
  assert.equal(JSON.stringify(state), original);
  assert.notDeepEqual(initialState().order, copy.order);
});

test('swaps preserve the full permutation and selection; pinned endpoints are atomic failures', () => {
  const state = toggleWishlist(initialState(), 'plant');
  const before = JSON.stringify(state), next = swapProducts(state, 'chair', 'plant');
  assert.deepEqual(next.order, ['sofa', 'plant', 'table-glass', 'table-solid', 'lamp', 'chair']);
  assert.equal(next.selected, 'chair'); assert.deepEqual(next.wishlist, ['plant']);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(swapProducts(next, 'chair', 'plant'), state);
  const pinned = togglePin(state, 'chair'), pinnedBefore = JSON.stringify(pinned);
  assert.throws(() => swapProducts(pinned, 'chair', 'lamp'), /锁定/);
  assert.throws(() => swapProducts(pinned, 'lamp', 'chair'), /锁定/);
  assert.deepEqual(swapProducts(pinned, 'chair', 'chair'), pinned);
  assert.equal(JSON.stringify(pinned), pinnedBefore);
  assert.deepEqual(swapProducts(togglePin(pinned, 'chair'), 'chair', 'lamp').order, ['sofa', 'lamp', 'table-glass', 'table-solid', 'chair', 'plant']);
});

test('preference plans actually rank the unlocked collection and retain stable ties and pinned slots', () => {
  const state = togglePin(togglePin(initialState(), 'chair'), 'table-solid');
  const before = JSON.stringify(state), plan = planPreference(state, 'reading');
  assert.deepEqual(plan.order, ['lamp', 'chair', 'table-glass', 'table-solid', 'sofa', 'plant']);
  assert.equal(JSON.stringify(state), before);
  assert.equal(plan.reasons.find(r => r.id === 'lamp').score, 3);
  assert.match(plan.reasons.find(r => r.id === 'chair').reason, /已锁定第 2 槽/);
  assert.match(plan.reasons.find(r => r.id === 'lamp').reason, /辅助灯具 \+3/);
  assert.deepEqual(plan.reasons.map(r => r.id), plan.order);
  assert.deepEqual(planPreference(state, 'natural').order, ['plant', 'chair', 'table-glass', 'table-solid', 'sofa', 'lamp']);
  const allPinned = { ...state, pinned: [...PRODUCT_IDS] };
  assert.deepEqual(planPreference(allPinned, 'natural').order, state.order);
  const reversed = { ...initialState(), order: [...PRODUCT_IDS].reverse() };
  assert.deepEqual(planPreference(reversed, 'reading').order, ['lamp', 'chair', 'table-solid', 'table-glass', 'plant', 'sofa']);
  assert.deepEqual(planPreference(reversed, 'all').order, reversed.order);
});

test('applying preferences preserves wishlist, selection and scene checkpoint context', () => {
  const state = { ...selectProduct(toggleWishlist(initialState(), 'table-solid'), 'plant'), lastScene: 'creative' };
  const natural = applyPreference(state, 'natural');
  assert.deepEqual(natural.order, ['chair', 'plant', 'table-glass', 'table-solid', 'sofa', 'lamp']);
  assert.equal(natural.preference, 'natural'); assert.equal(natural.selected, 'plant');
  assert.deepEqual(natural.wishlist, ['table-solid']); assert.deepEqual(natural.pinned, state.pinned);
  assert.equal(natural.lastScene, 'creative');
  assert.deepEqual(applyPreference(natural, 'natural'), natural);
  assert.deepEqual(applyPreference(natural, 'all').order, natural.order);
  assert.throws(() => applyPreference(state, 'unknown'));
  assert.throws(() => toggleWishlist(state, 'http://outside.invalid'));
});

test('damaged imports reject unknown data, duplicate and sparse lists, prototypes and accessors', () => {
  const bad = [
    { ...initialState(), version: 2 }, { ...initialState(), selected: 'unknown' },
    { ...initialState(), lastScene: '../outside' }, { ...initialState(), preference: 'all;eval' },
    { ...initialState(), order: PRODUCT_IDS.slice(1) }, { ...initialState(), order: ['sofa', ...PRODUCT_IDS.slice(0, 5)] },
    { ...initialState(), pinned: ['chair', 'chair'] }, { ...initialState(), wishlist: Array(7).fill('chair') },
    { ...initialState(), wishlist: new Array(2) }, { ...initialState(), price: 10 },
    Object.assign(Object.create({ inherited: true }), initialState()),
    JSON.parse(JSON.stringify(initialState()).replace('"version":1', '"version":1,"__proto__":{}')),
  ];
  const extraArray = initialState(); extraArray.order.extra = true; bad.push(extraArray);
  const inheritedArray = initialState(); Object.setPrototypeOf(inheritedArray.order, Object.create(Array.prototype)); bad.push(inheritedArray);
  const symbolic = initialState(); symbolic[Symbol('hidden')] = true; bad.push(symbolic);
  let read = false;
  const getter = initialState(); Object.defineProperty(getter, 'selected', { enumerable: true, get() { read = true; return 'chair'; } }); bad.push(getter);
  for (const state of bad) assert.throws(() => validateState(state));
  assert.equal(read, false);
  const good = initialState(); assert.deepEqual(validateState(good), good);
});

test('finite Chinese intentions only return registered local scenes and checkpoints are isolated', () => {
  const commands = ['去客厅', '打开汽车展厅', '请进入影像', '带我去地标', '我想去料理', '切换到创作台', '去滑板', '打开材料教学台', '请进入水下'];
  const ids = ['living', 'showroom', 'imaging', 'landmark', 'kitchen', 'creative', 'skate', 'materials', 'underwater'];
  commands.forEach((command, i) => {
    assert.deepEqual(resolveIntent(command), SCENES[ids[i]]);
    assert.match(resolveIntent(command).path, /^\.\/[a-z]+\.html$/);
  });
  assert.deepEqual(resolveIntent('  去 客厅！ '), SCENES.living);
  assert.deepEqual(resolveIntent('带我去滑板练习场'), SCENES.skate);
  assert.deepEqual(resolveIntent('切换到热响应教学台'), SCENES.materials);
  assert.deepEqual(resolveIntent('我想去水下拖动工作台'), SCENES.underwater);
  for (const text of ['不要去客厅', '去客厅再去料理', '客厅', '去https://outside.invalid', '去../showroom.html', '去客厅<script>', '不要去水下', '去滑板和材料', '去试衣间', '去真人试穿', 'x'.repeat(121), null]) {
    assert.equal(resolveIntent(text), null);
  }
  const value = { version: 1, token: '0123456789abcdef', sceneId: 'creative', shop: initialState() };
  const checkpoint = validateCheckpoint(value);
  checkpoint.shop.wishlist.push('lamp'); assert.deepEqual(value.shop.wishlist, []);
  for (const bad of [
    { ...value, token: '0123456789ABCDEF' }, { ...value, token: 'short' }, { ...value, version: 2 },
    { ...value, sceneId: 'constructor' }, { ...value, redirect: 'https://outside.invalid' },
    { ...value, shop: { ...initialState(), pinned: ['chair', 'chair'] } },
  ]) assert.throws(() => validateCheckpoint(bad));
});

test('nine task destinations preserve v1 collection fields and isolate returned records', () => {
  const ids = ['living', 'showroom', 'imaging', 'landmark', 'kitchen', 'creative', 'skate', 'materials', 'underwater'];
  assert.deepEqual(Object.keys(SCENES), ids);
  assert.deepEqual(Object.keys(SCENE_TASKS), ids);
  assert.ok(Object.isFrozen(SCENE_TASKS));
  assert.equal(Object.hasOwn(SCENES, 'fitting'), false);
  const original = togglePin(toggleWishlist(selectProduct(initialState(), 'plant'), 'chair'), 'sofa');
  const serialized = JSON.stringify(original);
  for (const id of ids) {
    const instruction = SCENE_TASKS[id];
    assert.ok(Object.isFrozen(instruction));
    assert.deepEqual(Object.keys(instruction), ['title', 'operation', 'expected', 'boundary']);
    for (const value of Object.values(instruction)) assert.ok(typeof value === 'string' && value.length > 0);
    const saved = validateState({ ...original, lastScene: id });
    assert.equal(saved.version, 1);
    assert.equal(saved.lastScene, id);
    assert.deepEqual({ ...saved, lastScene: null }, original);
    const checkpoint = validateCheckpoint({ version: 1, token: '0123456789abcdef', sceneId: id, shop: saved });
    assert.equal(checkpoint.sceneId, id);
    assert.deepEqual(checkpoint.shop, saved);
    checkpoint.shop.order.reverse(); checkpoint.shop.wishlist.push('lamp');
    assert.deepEqual(saved, { ...original, lastScene: id });
  }
  assert.equal(JSON.stringify(original), serialized);
  assert.deepEqual(validateState(JSON.parse(serialized)), original);
});

test('continuous editing is one transaction and pending undo only cancels that edit', () => {
  const history = new History();
  assert.equal(history.canUndo, false); assert.equal(history.canRedo, false);
  history.run('收藏', state => toggleWishlist(state, 'chair'));
  const saved = structuredClone(history.current);
  history.begin('拖动');
  assert.equal(history.begin('重复开始'), false);
  history.current = swapProducts(history.current, 'chair', 'lamp');
  history.current = swapProducts(history.current, 'chair', 'plant');
  assert.equal(history.undo(), true);
  assert.deepEqual(history.current, saved); assert.equal(history.pending, null);
  assert.equal(history.past.length, 1);
  history.begin('完整拖动');
  history.current = swapProducts(history.current, 'chair', 'lamp');
  history.current = swapProducts(history.current, 'chair', 'plant');
  assert.equal(history.commit(), true);
  const end = structuredClone(history.current);
  assert.equal(history.past.length, 2);
  history.undo(); assert.deepEqual(history.current, saved);
  history.redo(); assert.deepEqual(history.current, end);
  history.begin('未完成'); history.current.selected = 'sofa';
  history.redo(); assert.deepEqual(history.current, end);
  assert.equal(history.past.length, 2); assert.equal(history.state, history.current);
});

test('failed mutations and replacements preserve history; no-op keeps redo and capacity is forty', () => {
  const history = new History();
  history.run('收藏', state => toggleWishlist(state, 'plant'));
  history.undo();
  const before = structuredClone(history.current);
  assert.throws(() => history.run('损坏', state => { state.order.pop(); }));
  assert.deepEqual(history.current, before); assert.equal(history.pending, null); assert.equal(history.future.length, 1);
  assert.equal(history.run('无变更', () => undefined), false); assert.equal(history.future.length, 1);
  history.begin('未完成'); history.current.selected = 'sofa';
  assert.throws(() => history.replace({ ...initialState(), wishlist: ['missing'] }));
  assert.equal(history.pending.label, '未完成'); history.cancel();
  history.redo(); assert.deepEqual(history.current.wishlist, ['plant']);
  assert.throws(() => history.run('外部异常', state => { state.selected = 'sofa'; throw new Error('failed'); }), /failed/);
  assert.equal(history.current.selected, 'chair');
  history.replace(initialState());
  for (let i = 0; i < 45; i++) history.run('锁定切换', state => togglePin(state, 'chair'));
  assert.equal(history.past.length, 40);
  let undone = 0; while (history.undo()) undone++;
  assert.equal(undone, 40); assert.deepEqual(history.current.pinned, ['chair']);
  history.run('分支', state => selectProduct(state, 'lamp'));
  assert.equal(history.canRedo, false); assert.equal(history.current.selected, 'lamp');
});
