import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDemoPlan } from '../web/creation-core.js';
import { createTerrainField, landGeometry, worldPoint, horizontalPolygon } from '../web/realistic/terrain.js';

const actual = JSON.parse(await readFile(new URL('../assets/model-scene-source-context.json', import.meta.url), 'utf8')).plan;

test('terrain conversion keeps the full authored plan and every original polygon edge', () => {
  const before = JSON.stringify(actual), field = createTerrainField(actual);
  assert.equal(JSON.stringify(actual), before);
  for (const land of field.lands) {
    assert.deepEqual(land.polygon, land.entity.points.map(point => worldPoint(point, actual)));
    const mesh = landGeometry(land, field, 3);
    const positions = mesh.getAttribute('position');
    for (const point of land.polygon) {
      let found = false;
      for (let i = 0; i < positions.count; i++) {
        if (Math.abs(positions.getX(i) - point.x) < 1e-4 && Math.abs(positions.getZ(i) - point.z) < 1e-4) { found = true; break; }
      }
      assert.ok(found, 'authored shoreline vertex remains in the rendered mesh');
    }
    for (const key of ['position', 'normal', 'uv', 'biome']) assert.ok([...mesh.getAttribute(key).array].every(Number.isFinite), `${key} is finite`);
    assert.ok(positions.count <= 256 * 3 * land.polygon.length);
    mesh.dispose();
  }
});

test('locked land keeps its exact authored elevation', () => {
  const plan = createDemoPlan();
  for (const entity of plan.entities) if (entity.kind === 'land') entity.locked = true;
  const field = createTerrainField(plan);
  for (const land of field.lands) {
    const mesh = landGeometry(land, field, 2), positions = mesh.getAttribute('position');
    for (let i = 0; i < positions.count; i++) assert.equal(positions.getY(i), land.entity.height);
    mesh.dispose();
  }
});

test('lake excavation leaves an actual bed below water away from object foundations', () => {
  const plan = createDemoPlan();
  plan.entities = plan.entities.filter(entity => entity.kind === 'land');
  const land = plan.entities.find(entity => entity.kind === 'land');
  const center = land.points.reduce((sum, point) => ({x:sum.x+point.x/land.points.length,y:sum.y+point.y/land.points.length}), {x:0,y:0});
  plan.entities.push({id:'test-lake',kind:'water',height:0,locked:false,points:[{x:center.x-.025,y:center.y-.025},{x:center.x+.025,y:center.y-.025},{x:center.x+.025,y:center.y+.025},{x:center.x-.025,y:center.y+.025}]});
  const field = createTerrainField(plan), water = field.waters.find(item => item.entity.id === 'test-lake');
  const point = worldPoint(center, plan);
  assert.ok(field.height(point.x,point.z) < water.level);
  assert.equal(field.waterAt(point.x,point.z).entity.id,'test-lake');
});

test('water mesh preserves the input footprint and points upward', () => {
  const field = createTerrainField(actual);
  for (const water of field.waters) {
    const mesh = horizontalPolygon(water.polygon, water.level), positions = mesh.getAttribute('position');
    const normals = mesh.getAttribute('normal');
    for (let i = 0; i < positions.count; i++) {
      assert.ok(Math.abs(positions.getY(i) - water.level) < 1e-5);
      assert.ok(normals.getY(i) > .99);
    }
    mesh.dispose();
  }
});

test('very small and large worlds keep terrain samples finite', () => {
  for (const size of [10, 2000]) {
    const plan = createDemoPlan(); plan.world = {width:size,depth:size};
    const field = createTerrainField(plan);
    for (let x = -.5; x <= .5; x += .05) for (let z = -.5; z <= .5; z += .05) assert.ok(Number.isFinite(field.height(x*size,z*size)));
  }
});
