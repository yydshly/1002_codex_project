import fs from 'node:fs/promises';
import { Box3, Matrix4, Vector3, Quaternion } from '../web/studio/vendor/three.module.js';
import { OBJECTS, TABLE_VARIANTS } from '../web/studio/core.js';

// The same glTF accessor bounds and node transforms used by GLTFLoader.
// Keep editor constraints available before asynchronous asset loading.
for (const def of [...OBJECTS.filter(o => o.asset), { id: 'table', ...TABLE_VARIANTS.solid }]) {
  const document = JSON.parse(await fs.readFile(new URL(`../web/studio/assets/models/${def.asset}/${def.asset}.gltf`, import.meta.url), 'utf8'));
  const bounds = new Box3();
  function visit(index, parent) {
    const node = document.nodes[index], local = new Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new Vector3().fromArray(node.translation || [0,0,0]), new Quaternion().fromArray(node.rotation || [0,0,0,1]), new Vector3().fromArray(node.scale || [1,1,1]));
    const matrix = parent.clone().multiply(local);
    if (node.mesh !== undefined) for (const primitive of document.meshes[node.mesh].primitives) {
      const accessor = document.accessors[primitive.attributes.POSITION];
      bounds.union(new Box3(new Vector3().fromArray(accessor.min), new Vector3().fromArray(accessor.max)).applyMatrix4(matrix));
    }
    for (const child of node.children || []) visit(child, matrix);
  }
  for (const index of document.scenes[document.scene || 0].nodes) visit(index, new Matrix4());
  const size = bounds.getSize(new Vector3());
  const factor = ['plant','lamp','table'].includes(def.id) ? def.height / size.y : def.width / size.x;
  const measured = { id: def.id, width: size.x * factor, depth: size.z * factor, height: size.y * factor };
  if (process.argv.includes('--check') && ['width','depth','height'].some(key => Math.abs(measured[key] - def[key]) > .005)) throw new Error(`资产尺寸已变化：${def.id}`);
  console.log(JSON.stringify(measured));
}
