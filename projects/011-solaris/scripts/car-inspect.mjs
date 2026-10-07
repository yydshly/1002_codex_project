import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { Box3, Matrix4, Vector3, Quaternion } from '../web/studio/vendor/three.module.js';

const url = new URL('../web/assets/car/CarConcept.glb', import.meta.url);
const bytes = await fs.readFile(url);
if (bytes.toString('utf8', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB header');
const jsonLength = bytes.readUInt32LE(12);
if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Missing GLB JSON');
const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
const whole = new Box3(), nodes = {};
function visit(index, parent) {
  const node = document.nodes[index], local = new Matrix4();
  if (node.matrix) local.fromArray(node.matrix);
  else local.compose(new Vector3().fromArray(node.translation || [0, 0, 0]), new Quaternion().fromArray(node.rotation || [0, 0, 0, 1]), new Vector3().fromArray(node.scale || [1, 1, 1]));
  const matrix = parent.clone().multiply(local), bounds = new Box3();
  if (node.mesh !== undefined) for (const primitive of document.meshes[node.mesh].primitives) {
    const accessor = document.accessors[primitive.attributes.POSITION];
    bounds.union(new Box3(new Vector3().fromArray(accessor.min), new Vector3().fromArray(accessor.max)).applyMatrix4(matrix));
  }
  whole.union(bounds);
  nodes[node.name || `node-${index}`] = { index, parentName: document.nodes.find(n => n.children?.includes(index))?.name || null, pivot: new Vector3().setFromMatrixPosition(matrix).toArray(), min: bounds.min.toArray(), max: bounds.max.toArray(), center: bounds.getCenter(new Vector3()).toArray(), localTranslation: node.translation || [0,0,0], childNames: (node.children || []).map(i => document.nodes[i].name), mesh: node.mesh, localMatrix: local.toArray(), worldMatrix: matrix.toArray() };
  for (const child of node.children || []) visit(child, matrix);
}
for (const index of document.scenes[document.scene || 0].nodes) visit(index, new Matrix4());
for (const name of ['BodyHood', 'Engine', 'BodyHeadlights', 'BodyTaillights', 'BodyDoorLColor1', 'BodyDoorRColor1']) if (!nodes[name] || !Number.isInteger(nodes[name].mesh)) throw new Error(`Missing required component: ${name}`);
if (document.buffers.some(b => b.uri) || document.images.some(i => i.uri)) throw new Error('Car GLB must be self-contained');
const hood = nodes.BodyHood, root = new Matrix4().fromArray(nodes.BodyUnderside.worldMatrix);
const hinge = new Matrix4().compose(new Vector3().fromArray(hood.localTranslation), new Quaternion().setFromAxisAngle(new Vector3(1,0,0), Math.PI / 3), new Vector3(1,1,1));
const hoodMesh = document.meshes[hood.mesh], openedHood = new Box3();
for (const primitive of hoodMesh.primitives) {
  const accessor = document.accessors[primitive.attributes.POSITION];
  openedHood.union(new Box3(new Vector3().fromArray(accessor.min), new Vector3().fromArray(accessor.max)).applyMatrix4(root.clone().multiply(hinge)));
}
const triangles = meshIndex => document.meshes[meshIndex].primitives.reduce((total,p) => total + document.accessors[p.indices ?? p.attributes.POSITION].count / 3,0);
const result = { asset: 'CarConcept', bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), copyright: document.asset.copyright, generator: document.asset.generator, extensionsUsed: document.extensionsUsed, extensionsRequired: document.extensionsRequired || [], nodes: document.nodes.length, meshes: document.meshes.length, materialCount: document.materials.length, embeddedImages: document.images.length, embeddedImageTypes:[...new Set(document.images.map(i=>i.mimeType))], animations: document.animations?.length || 0, triangles:document.meshes.reduce((sum,_,i)=>sum+triangles(i),0), engineTriangles:triangles(nodes.Engine.mesh), bounds: { min: whole.min.toArray(), max: whole.max.toArray(), size: whole.getSize(new Vector3()).toArray(), center: whole.getCenter(new Vector3()).toArray() }, components: Object.fromEntries(['BodyUnderside','Engine','BodyHood','BodyHoodInterior01','BodyHoodInterior02','BodyHoodUnder','BodyHeadlights','BodyTaillights','BodyDoorLColor1','BodyDoorRColor1','BodyRearPanelsColor1'].map(name => [name, nodes[name]])), hoodOpenedPositive60: { min: openedHood.min.toArray(), max: openedHood.max.toArray(), center: openedHood.getCenter(new Vector3()).toArray() }, materials: document.materials.map((m,index) => ({ index, name:m.name, emissiveFactor:m.emissiveFactor, emissiveStrength:m.extensions?.KHR_materials_emissive_strength?.emissiveStrength })), variants: document.extensions?.KHR_materials_variants?.variants };
if (process.argv.includes('--write')) await fs.writeFile(new URL('../web/assets/car/inspection.json', import.meta.url), `${JSON.stringify(result,null,2)}\n`);
console.log(JSON.stringify(result, null, 2));
