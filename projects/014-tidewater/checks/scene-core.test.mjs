import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_DEFS, createScene, validateScene, applyOperations, parseInstruction } from '../web/scene-core.js';

const roundtrip = (value) => JSON.parse(JSON.stringify(value));

test('default scene is deterministic, registered and survives JSON roundtrip', () => {
  const scene = createScene();
  assert.equal(validateScene(scene), true);
  assert.deepEqual(scene, createScene());
  assert.deepEqual(roundtrip(scene), scene);
  assert.equal(validateScene(roundtrip(scene)), true);
  assert.deepEqual(scene.objects.map((item) => item.id), ASSET_DEFS.map((item) => item.id));
  assert.ok(Object.isFrozen(ASSET_DEFS));
  const independent = createScene();
  independent.objects[0].x = 99;
  assert.equal(scene.objects[0].x, 64.5);
});

test('environment and preset changes preserve object IDs, transforms and visibility', () => {
  const scene = createScene();
  const result = applyOperations(scene, [{ type: 'environment', values: { timeOfDay: 22, swell: 0.1 } }]);
  assert.deepEqual(result.scene.objects, scene.objects);
  assert.equal(scene.environment.timeOfDay, 16.2);
  assert.equal(result.changes.length, 2);
  const sunset = applyOperations(result.scene, [{ type: 'preset', preset: 'sunset' }]).scene;
  assert.deepEqual(sunset.objects, scene.objects);
  assert.equal(sunset.preset, 'sunset');
  assert.equal(sunset.environment.timeOfDay, 18.3);
});

test('mixed operations apply to a copy, and a later invalid operation rejects everything', () => {
  const scene = createScene(), snapshot = roundtrip(scene);
  assert.throws(() => applyOperations(scene, [
    { type: 'environment', values: { windSpeed: 4 } },
    { type: 'object', id: 'boat', values: { x: 75 } },
    { type: 'camera', preset: 'unknown' },
  ]), /不支持镜头/);
  assert.deepEqual(scene, snapshot);
  const result = applyOperations(scene, [
    { type: 'object', values: { x: 42, rotation: 45 } },
    { type: 'camera', preset: 'boat' },
  ], { selectedId: 'boat' });
  assert.equal(result.scene.objects[0].id, 'boat');
  assert.equal(result.scene.objects[0].x, 42);
  assert.equal(result.scene.camera.preset, 'boat');
  assert.deepEqual(scene, snapshot);
});

test('locked objects reject all edits until an explicit unlock precedes the edit', () => {
  const scene = applyOperations(createScene(), [{ type: 'object', id: 'boat', values: { locked: true } }]).scene;
  const snapshot = roundtrip(scene);
  assert.throws(() => applyOperations(scene, [
    { type: 'environment', values: { timeOfDay: 12 } },
    { type: 'object', id: 'boat', values: { x: 50 } },
  ]), /已锁定/);
  assert.throws(() => applyOperations(scene, [{ type: 'object', id: 'boat', values: { locked: false, x: 50 } }]), /已锁定/);
  assert.deepEqual(scene, snapshot);
  const result = applyOperations(scene, [
    { type: 'object', id: 'boat', values: { locked: false } },
    { type: 'object', id: 'boat', values: { x: 50 } },
  ]).scene;
  assert.equal(result.objects[0].x, 50);
  assert.equal(result.objects[0].locked, false);
});

test('schema rejects unknown fields, NaN, duplicated IDs, unsupported versions and bad assets', () => {
  for (const mutate of [
    (scene) => { scene.unregistered = 1; },
    (scene) => { scene.environment.rain = 1; },
    (scene) => { scene.objects[0].speed = 4; },
    (scene) => { scene.environment.windSpeed = NaN; },
    (scene) => { scene.objects[0].x = Infinity; },
    (scene) => { scene.objects[1] = { ...scene.objects[0] }; },
    (scene) => { scene.version = 2; },
    (scene) => { scene.objects[0].asset = 'invented-boat'; },
    (scene) => { scene.objects[0].visible = 'true'; },
    (scene) => { scene.seed = 1.5; },
  ]) {
    const scene = createScene();
    mutate(scene);
    assert.throws(() => validateScene(scene));
  }
});

test('operations reject unknown fields and nonfinite or out-of-range values without changing identity', () => {
  const scene = createScene(), snapshot = roundtrip(scene);
  for (const operation of [
    { type: 'object', id: 'boat', values: { id: 'other' } },
    { type: 'object', id: 'boat', values: { scale: NaN } },
    { type: 'object', id: 'boat', values: { x: 501 } },
    { type: 'object', id: 'boat', values: { visible: 1 } },
    { type: 'object', id: null, values: { visible: false } },
    { type: 'environment', values: { timeOfDay: 25 } },
    { type: 'environment', values: { cloudCover: 1.1 } },
    { type: 'environment', values: { windSpeed: 4 }, extra: 'bad' },
    { type: 'delete', id: 'boat' },
  ]) assert.throws(() => applyOperations(scene, [operation]));
  assert.deepEqual(scene, snapshot);
});

test('parser creates explicit environment and camera patches and preserves objects', () => {
  const scene = createScene();
  const parsed = parseInstruction('保持建筑布局，日落，浪小一点，风速改为 3 米每秒，镜头船边', scene);
  assert.equal(parsed.operations.length, 4);
  const result = applyOperations(scene, parsed.operations).scene;
  assert.equal(result.environment.timeOfDay, 18.3);
  assert.equal(result.environment.windSpeed, 3);
  assert.ok(result.environment.swell < scene.environment.swell);
  assert.equal(result.camera.preset, 'boat');
  assert.deepEqual(result.objects, scene.objects);
  assert.match(parsed.summary, /保持现有布局/);
});

test('parser chains selected-object edits relative to the preview and keeps stable IDs', () => {
  const scene = createScene();
  const parsed = parseInstruction('选中物体向左移动 5 米，向右移动 2 米，放大20%，旋转90度，隐藏', scene, 'cabin-a');
  const result = applyOperations(scene, parsed.operations).scene;
  const before = scene.objects.find((item) => item.id === 'cabin-a'), after = result.objects.find((item) => item.id === 'cabin-a');
  assert.equal(after.x, before.x - 3);
  assert.equal(after.scale, 1.2);
  assert.equal(after.rotation, 90);
  assert.equal(after.visible, false);
  assert.deepEqual(result.objects.map((item) => item.id), scene.objects.map((item) => item.id));
  assert.equal(before.visible, true);
});

test('unsupported effect or unparsed clause rejects the complete compound instruction', () => {
  const scene = createScene(), snapshot = roundtrip(scene);
  assert.throws(() => parseInstruction('日落，保持建筑布局，改成雨夜', scene), /没有雨/);
  assert.throws(() => parseInstruction('日落，风速3米每秒，给小屋换红色屋顶', scene), /不支持指令片段/);
  assert.throws(() => parseInstruction('向左移动5米', scene), /需要先选择/);
  assert.deepEqual(scene, snapshot);
});

test('parser respects locks and contradictory layout-preservation constraints', () => {
  const scene = applyOperations(createScene(), [{ type: 'object', id: 'cabin-a', values: { locked: true } }]).scene;
  assert.throws(() => parseInstruction('日落，向左移动5米', scene, 'cabin-a'), /已锁定/);
  const parsed = parseInstruction('解锁，向左移动5米，锁定', scene, 'cabin-a');
  const result = applyOperations(scene, parsed.operations).scene;
  assert.equal(result.objects.find((item) => item.id === 'cabin-a').locked, true);
  assert.throws(() => parseInstruction('保持建筑布局，向左移动5米', createScene(), 'cabin-a'), /同时要求保持布局/);
});

test('numeric time, cloud percentages, absolute rotation and presets remain roundtrip-safe', () => {
  const scene = createScene();
  const parsed = parseInstruction('时间设为18:30，云量30%，旋转到45度，显示选中物体', scene, 'boat');
  const result = applyOperations(scene, parsed.operations).scene;
  assert.equal(result.environment.timeOfDay, 18.5);
  assert.equal(result.environment.cloudCover, 0.3);
  assert.equal(result.objects[0].rotation, 45);
  assert.equal(validateScene(roundtrip(result)), true);
  const preset = parseInstruction('切换到外海预设', result);
  assert.equal(applyOperations(result, preset.operations).scene.preset, 'open-water');
  assert.throws(() => parseInstruction('时间18:75', scene), /有效/);
});

test('the interface sample commands have explicit, validated operations', () => {
  const scene = createScene();
  const sunset = parseInstruction('改成日落，海浪平静一点', scene);
  assert.equal(sunset.operations[0].values.timeOfDay, 18.3);
  assert.ok(sunset.operations[1].values.swell < scene.environment.swell);
  const move = parseInstruction('把选中的物体向右移动10米', scene, 'boat');
  assert.equal(move.operations[0].values.x, 74.5);
  const camera = parseInstruction('切换鸟瞰镜头', scene);
  assert.equal(camera.operations[0].preset, 'overview');
  const lock = parseInstruction('锁定选中的物体', scene, 'boat');
  assert.equal(lock.operations[0].values.locked, true);
  const polite = parseInstruction('请帮我切换鸟瞰镜头', scene);
  assert.deepEqual(polite.operations, camera.operations);
});
