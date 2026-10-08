// Portable delivery uses an ordinary, uncompressed ZIP. There is no runtime
// package fetch and the archive can be read by Python, Explorer and unzip.
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}
export function safeArchivePath(path) {
  if (typeof path !== 'string' || !path || path.length > 240 || /[\\\x00-\x1f\x7f:]/u.test(path)
      || path.startsWith('/') || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('交付文件路径无效。');
  }
  return path;
}
export function makeStoredZip(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 65535) throw new Error('交付文件列表无效。');
  const names = new Set(), entries = files.map(({ path, bytes }) => {
    safeArchivePath(path);
    if (names.has(path)) throw new Error(`交付文件重名：${path}`);
    names.add(path);
    if (!(bytes instanceof Uint8Array) || bytes.length > 0xffffffff) throw new Error('交付文件内容无效。');
    return { path, bytes, name: encoder.encode(path), crc: crc32(bytes) };
  });
  const localSize = entries.reduce((size, entry) => size + 30 + entry.name.length + entry.bytes.length, 0);
  const centralSize = entries.reduce((size, entry) => size + 46 + entry.name.length, 0);
  const total = localSize + centralSize + 22;
  if (total > 256 * 1024 * 1024) throw new Error('交付包超过 256 MiB，请减少场景复杂度。');
  const output = new Uint8Array(total), view = new DataView(output.buffer);
  let offset = 0;
  for (const entry of entries) {
    entry.offset = offset;
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true); // ZIP 2.0, UTF-8, stored.
    view.setUint16(offset + 6, 0x0800, true);
    view.setUint16(offset + 12, 0x21, true); // 1980-01-01, deterministic.
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.bytes.length, true);
    view.setUint32(offset + 22, entry.bytes.length, true);
    view.setUint16(offset + 26, entry.name.length, true);
    output.set(entry.name, offset + 30); output.set(entry.bytes, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.bytes.length;
  }
  for (const entry of entries) {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true); view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true); view.setUint16(offset + 14, 0x21, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.bytes.length, true); view.setUint32(offset + 24, entry.bytes.length, true);
    view.setUint16(offset + 28, entry.name.length, true); view.setUint32(offset + 42, entry.offset, true);
    output.set(entry.name, offset + 46); offset += 46 + entry.name.length;
  }
  view.setUint32(offset, 0x06054b50, true); view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true); view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, localSize, true);
  return output;
}
export function inspectBinaryGLTF(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 28) throw new Error('GLB 文件过短。');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
      || view.getUint32(8, true) !== buffer.byteLength) throw new Error('GLB 文件头无效。');
  let offset = 12, json = null, binaryChunks = 0, binaryByteOffset = 0, binaryByteLength = 0;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw new Error('GLB 分块不完整。');
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
    if (length % 4 || offset + 8 + length > buffer.byteLength) throw new Error('GLB 分块尺寸无效。');
    if (type === 0x4e4f534a) {
      if (json || offset !== 12) throw new Error('GLB JSON 分块顺序无效。');
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, length)));
    } else if (type === 0x004e4942) { binaryChunks++; binaryByteOffset = offset + 8; binaryByteLength = length; }
    else throw new Error('GLB 包含未支持的分块。');
    offset += 8 + length;
  }
  if (!json || json.asset?.version !== '2.0' || binaryChunks !== 1) throw new Error('GLB 结构无效。');
  const resources = [...(json.buffers ?? []), ...(json.images ?? [])];
  if (resources.some(resource => resource.uri && !resource.uri.startsWith('data:'))) throw new Error('GLB 引用了外部资源。');
  const sourceIds = [...new Set((json.nodes ?? []).flatMap(node => [node.extras?.sourceId, node.extras?.sourceEntityId]).filter(Boolean))];
  return { json, bytes: buffer.byteLength, sourceIds, embeddedResources: true, binaryByteOffset, binaryByteLength };
}

// Preserve bufferView IDs and every accessor/image reference. Separate views
// may point at the same exact bytes in the BIN chunk: this also deduplicates
// identical PNGs emitted repeatedly by the exporter's metallic/roughness pass.
export async function repackBinaryGLTFLosslessly(buffer) {
  const original = inspectBinaryGLTF(buffer), json = original.json, views = json.bufferViews ?? [];
  const unchanged = reason => ({ buffer, stats: { method: 'exact-buffer-view-byte-sharing', lossyCompression: false,
    originalBytes: buffer.byteLength, packedBytes: buffer.byteLength, bytesSaved: 0, performed: false, reason } });
  if (json.buffers?.length !== 1 || json.buffers[0].uri || !views.length
      || json.extensionsUsed?.includes('EXT_meshopt_compression')
      || views.some(view => view.extensions?.EXT_meshopt_compression)) return unchanged('unsupported-buffer-layout');
  const declaredLength = json.buffers[0].byteLength;
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > original.binaryByteLength) throw new Error('GLB BIN 声明尺寸无效。');
  const bin = new Uint8Array(buffer, original.binaryByteOffset, declaredLength), buckets = new Map(), blocks = [];
  let packedLength = 0, reusedViews = 0;
  for (const view of views) {
    const offset = view.byteOffset ?? 0, length = view.byteLength;
    if (view.buffer !== 0 || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 || offset + length > bin.length) return unchanged('unsupported-buffer-view');
    const slice = bin.subarray(offset, offset + length), digest = await crypto.subtle.digest('SHA-256', slice);
    const key = `${length}:${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
    const bucket = buckets.get(key) ?? [];
    const same = bucket.find(block => { for (let index = 0; index < length; index++) if (block.bytes[index] !== slice[index]) return false; return true; });
    if (same) { view.byteOffset = same.offset; reusedViews++; }
    else {
      const block = { bytes: slice, offset: packedLength };
      packedLength += Math.ceil(length / 4) * 4; blocks.push(block); bucket.push(block); buckets.set(key, bucket);
      view.byteOffset = block.offset;
    }
  }
  if (!reusedViews) return unchanged('no-identical-buffer-views');
  json.buffers[0].byteLength = packedLength;
  const encoded = encoder.encode(JSON.stringify(json)), jsonLength = Math.ceil(encoded.length / 4) * 4;
  const total = 12 + 8 + jsonLength + 8 + packedLength, output = new ArrayBuffer(total), bytes = new Uint8Array(output), header = new DataView(output);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, total, true);
  header.setUint32(12, jsonLength, true); header.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength); bytes.set(encoded, 20);
  header.setUint32(20 + jsonLength, packedLength, true); header.setUint32(24 + jsonLength, 0x004e4942, true);
  const binStart = 28 + jsonLength;
  for (const block of blocks) bytes.set(block.bytes, binStart + block.offset);
  if (total >= buffer.byteLength) return unchanged('sharing-would-not-reduce-file-size');
  // Validate the rewritten container before it reaches the independent loader.
  inspectBinaryGLTF(output);
  return { buffer: output, stats: { method: 'exact-buffer-view-byte-sharing', lossyCompression: false, performed: true,
    originalBytes: buffer.byteLength, packedBytes: total, bytesSaved: buffer.byteLength - total,
    bufferViewsPreserved: views.length, uniqueByteBlocks: blocks.length, reusedBufferViews: reusedViews,
    accessorReferencesPreserved: true, imageReferencesPreserved: true, nodeReferencesPreserved: true } };
}
export function inspectGeometryTree(root, expectedIds = []) {
  if (!root || typeof root.traverse !== 'function') throw new Error('待交付场景无效。');
  let meshes = 0, triangles = 0, vertices = 0, texturedMaterials = 0;
  const ids = new Set(), materials = new Set(), minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  root.updateMatrixWorld?.(true);
  root.traverse(object => {
    for (const id of [object.userData?.sourceId, object.userData?.sourceEntityId]) if (id) ids.add(id);
    if (object.matrix?.elements?.some(value => !Number.isFinite(value))) throw new Error('交付节点变换包含非有限值。');
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry, position = geometry?.getAttribute('position');
    if (!position || !position.count || position.itemSize !== 3) throw new Error('交付网格缺少位置数据。');
    vertices += position.count;
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      for (let index = 0; index < attribute.array.length; index++) if (!Number.isFinite(attribute.array[index])) throw new Error(`交付网格 ${name} 包含非有限值。`);
    }
    if (geometry.index) {
      for (const index of geometry.index.array) if (!Number.isInteger(index) || index < 0 || index >= position.count) throw new Error('交付网格索引越界。');
    }
    triangles += Math.floor((geometry.index?.count ?? position.count) / 3) * (object.isInstancedMesh ? object.count : 1);
    for (let index = 0; index < position.count; index++) {
      const coordinates = [position.getX(index), position.getY(index), position.getZ(index)];
      coordinates.forEach((coordinate, axis) => { minimum[axis] = Math.min(minimum[axis], coordinate); maximum[axis] = Math.max(maximum[axis], coordinate); });
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) throw new Error('交付网格缺少材质。');
      if (materials.has(material)) continue;
      materials.add(material);
      for (const property of ['roughness', 'metalness', 'opacity']) if (property in material && !Number.isFinite(material[property])) throw new Error('交付材质参数无效。');
      if (material.color && ![material.color.r, material.color.g, material.color.b].every(Number.isFinite)) throw new Error('交付材质颜色无效。');
      if (material.map || material.normalMap || material.roughnessMap) texturedMaterials++;
    }
  });
  if (!meshes || !triangles || ![...minimum, ...maximum].every(Number.isFinite)) throw new Error('交付场景没有有效网格。');
  const missingIds = expectedIds.filter(id => !ids.has(id));
  if (missingIds.length) throw new Error(`交付后缺少来源对象：${missingIds.join('、')}`);
  return { meshes, triangles, vertices, materials: materials.size, texturedMaterials, sourceIds: [...ids], finiteGeometry: true, validIndices: true, sourceIdsPreserved: true };
}

// Only run on the independently owned export snapshot. Identical byte arrays
// become shared glTF accessors, while every editable node keeps its transform,
// material and provenance. No geometry is simplified or numerically rounded.
export async function shareIdenticalSnapshotGeometries(root) {
  const geometries = new Set(), buckets = new Map(), replacements = new Map();
  root.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
  const bufferDigests = new WeakMap();
  const rawArray = attribute => attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
  const bytes = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  async function attributeDescriptor(attribute) {
    const array = rawArray(attribute);
    if (!ArrayBuffer.isView(array)) throw new Error('导出几何属性缺少类型化数组。');
    if (!bufferDigests.has(array)) bufferDigests.set(array, crypto.subtle.digest('SHA-256', bytes(array)).then(result =>
      [...new Uint8Array(result)].map(value => value.toString(16).padStart(2, '0')).join('')));
    return { arrayType: array.constructor.name, byteLength: array.byteLength, itemSize: attribute.itemSize,
      count: attribute.count, normalized: Boolean(attribute.normalized), gpuType: attribute.gpuType ?? null,
      interleaved: Boolean(attribute.isInterleavedBufferAttribute), stride: attribute.data?.stride ?? null,
      offset: attribute.offset ?? null, name: attribute.name ?? '',
      instanced: Boolean(attribute.isInstancedBufferAttribute), meshPerAttribute: attribute.meshPerAttribute ?? null,
      digest: await bufferDigests.get(array) };
  }
  function attributesOf(geometry) {
    const result = Object.keys(geometry.attributes).sort().map(name => [name, geometry.attributes[name]]);
    if (geometry.index) result.push(['$index', geometry.index]);
    for (const name of Object.keys(geometry.morphAttributes ?? {}).sort()) geometry.morphAttributes[name].forEach((attribute, index) => result.push([`$morph/${name}/${index}`, attribute]));
    return result;
  }
  function sameArrays(first, second) {
    const a = attributesOf(first), b = attributesOf(second);
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) {
      if (a[index][0] !== b[index][0]) return false;
      const aBytes = bytes(rawArray(a[index][1])), bBytes = bytes(rawArray(b[index][1]));
      if (aBytes.length !== bBytes.length) return false;
      for (let at = 0; at < aBytes.length; at++) if (aBytes[at] !== bBytes[at]) return false;
    }
    return true;
  }
  function byteCount(geometry) { return attributesOf(geometry).reduce((count, [, attribute]) => count + rawArray(attribute).byteLength, 0); }
  let bytesBefore = 0;
  for (const geometry of geometries) {
    bytesBefore += byteCount(geometry);
    const descriptor = { attributes: await Promise.all(attributesOf(geometry).map(async ([name, attribute]) => [name, await attributeDescriptor(attribute)])),
      groups: geometry.groups ?? [], drawRange: geometry.drawRange ?? null,
      morphTargetsRelative: Boolean(geometry.morphTargetsRelative), name: geometry.name ?? '', userData: geometry.userData ?? {} };
    const key = JSON.stringify(descriptor), bucket = buckets.get(key) ?? [];
    const identical = bucket.find(candidate => sameArrays(geometry, candidate));
    if (identical) replacements.set(geometry, identical);
    else { bucket.push(geometry); buckets.set(key, bucket); }
  }
  let reassignedMeshes = 0;
  root.traverse(object => { if (replacements.has(object.geometry)) { object.geometry = replacements.get(object.geometry); reassignedMeshes++; } });
  const canonical = new Set([...geometries].map(geometry => replacements.get(geometry) ?? geometry));
  const bytesAfter = [...canonical].reduce((count, geometry) => count + byteCount(geometry), 0);
  return { method: 'exact-attribute-index-byte-sharing', lossySimplification: false,
    geometriesBefore: geometries.size, geometriesAfter: canonical.size, reassignedMeshes,
    attributeBytesBefore: bytesBefore, attributeBytesAfter: bytesAfter, sharedAttributeBytes: bytesBefore - bytesAfter,
    nodesPreserved: true, transformsPreserved: true, materialsPreserved: true, sourceIdsPreserved: true };
}
