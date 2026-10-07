import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(project, 'web/support');
const lampOnly = process.argv.includes('--lamp');
const manifestFile = path.join(target, lampOnly ? 'freestanding-lamp-manifest.json' : 'assets-manifest.json');
const offline = process.argv.includes('--cached');
const checkOnly = process.argv.includes('--check');
const headers = { 'User-Agent': 'AtelierSupportWorkbench/0.18 asset-build' };
const selected = [
  { id: 'round_wooden_table_02', label: '圆形木桌', design: 'Independent round tabletop and pedestal design.' },
  { id: 'wooden_table_02', label: '乡村木桌', design: 'Independent rustic rectangular wooden table design.' },
  { id: 'CoffeeTable_01', label: '复古茶几', design: 'Independent painted vintage coffee table design.' },
];
const selectedLamp = { id: 'industrial_pipe_lamp', label: '工业管灯', design: 'Independent industrial desk lamp with a heavy base; selected from official Desk Lamps category, not modified from the clamp-mounted source.' };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const packageFingerprint = files => sha256(files.slice().sort((a, b) => a.path.localeCompare(b.path, 'en')).map(file => `${file.path}:${file.sha256}\n`).join(''));

function localFile(relative) {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes(':') || relative.startsWith('/')) throw new Error('Invalid relative asset path');
  const resolved = path.resolve(target, relative);
  if (!resolved.startsWith(target + path.sep)) throw new Error('Asset path escaped support directory');
  return resolved;
}

async function responseBytes(url) {
  const source = new URL(url);
  if (!['api.polyhaven.com', 'dl.polyhaven.org'].includes(source.hostname) || source.protocol !== 'https:') throw new Error('Asset source outside official Poly Haven API/download hosts');
  const response = await fetch(source, { headers, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Download ${source.pathname}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function readOrDownload(relative, source, expected = {}) {
  const file = localFile(relative);
  let bytes;
  try { bytes = await readFile(file); }
  catch (error) {
    if (offline || error.code !== 'ENOENT') throw error;
    bytes = await responseBytes(source);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  if (expected.size !== undefined && bytes.length !== expected.size) throw new Error(`Source length mismatch: ${relative}`);
  // Some historic API hashes omit a leading zero; compare the full 128-bit hash.
  if (expected.md5 && createHash('md5').update(bytes).digest('hex') !== expected.md5.padStart(32, '0').toLowerCase()) throw new Error(`Source MD5 mismatch: ${relative}`);
  return { bytes, record: { path: relative, source, bytes: bytes.length, sha256: sha256(bytes), ...(expected.md5 ? { sourceMd5: expected.md5.padStart(32, '0').toLowerCase() } : {}) } };
}

function inspectStaticDocument(document) {
  if (document.asset?.version !== '2.0') throw new Error('Only glTF 2.0 is registered');
  if (document.animations?.length || document.skins?.length || document.nodes?.some(node => node.skin !== undefined || node.weights?.length)) throw new Error('Animated/skinned/morphed source outside static scope');
  if (document.extensionsRequired?.length) throw new Error(`Required extensions outside uncompressed scope: ${document.extensionsRequired.join(', ')}`);
  const primitives = document.meshes?.flatMap(mesh => mesh.primitives ?? []) ?? [];
  if (!primitives.length || primitives.some(primitive => (primitive.mode ?? 4) !== 4 || primitive.targets?.length || primitive.extensions?.KHR_draco_mesh_compression)) throw new Error('Only uncompressed static triangle primitives are registered');
  if (!document.scenes?.length) throw new Error('Source contains no scene');
  return {
    animationCount: document.animations?.length ?? 0,
    skinCount: document.skins?.length ?? 0,
    nodeCount: document.nodes?.length ?? 0,
    meshCount: document.meshes.length,
    primitiveCount: primitives.length,
    extensionsUsed: document.extensionsUsed ?? [],
    extensionsRequired: document.extensionsRequired ?? [],
    geometricAnalysis: 'Not run by asset preparation; no support faces, contact anchors or thresholds are assigned.',
  };
}

async function checkManifest() {
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (manifest.rejected?.length && lampOnly) throw new Error(`Retained source rejection: ${manifest.rejected.map(record => record.reason).join('; ')}`);
  const assets = lampOnly ? [manifest] : manifest.assets;
  let bytes = 0;
  for (const asset of assets) {
    for (const file of [...asset.metadataFiles, ...asset.files]) {
      const data = await readFile(localFile(file.path));
      if (data.length !== file.bytes || sha256(data) !== file.sha256) throw new Error(`Asset fingerprint changed: ${file.path}`);
      if (asset.files.includes(file)) bytes += data.length;
    }
    if (packageFingerprint(asset.files) !== asset.sourceFingerprint) throw new Error(`Package fingerprint changed: ${asset.id}`);
    inspectStaticDocument(JSON.parse(await readFile(localFile(asset.modelPath), 'utf8')));
  }
  console.log(`Checked ${assets.length} independent static source packages (${bytes} runtime bytes); no support geometry analysis was run.`);
  if (manifest.rejected?.length) {
    console.log(`Retained ${manifest.rejected.length} rejected asset record(s).`);
    process.exitCode = 1;
  }
}

if (checkOnly) {
  await checkManifest();
} else if (lampOnly) {
  // Separate source selection. This branch neither rewrites the table manifest
  // nor inspects contact geometry or changes the frozen detection policy.
  const manifest = {
    schemaVersion: 1, preparedAt: '2026-10-07', runtimeNetwork: 'local-only',
    status: 'source-prepared-contact-validation-separate',
    normalization: {
      policyVersion: 'lamp-height-052-v1', upAxis: '+Y', sourceUnit: 'meter',
      targetDesignHeightMeters: 0.52,
      unitAuthority: 'https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units',
      rule: 'After all source-node transforms: positive uniform s = 0.52 / (maxY - minY), X/Z bounding center at zero, minY at floor.',
      heightMeaning: 'Shared lamp product design height; not measured source dimensions.',
    },
    sourceSemanticReview: {
      officialCategory: 'Lighting / Floor & Desk / Desk Lamps',
      officialSource: 'https://polyhaven.com/a/industrial_pipe_lamp',
      preview: 'https://cdn.polyhaven.com/asset_img/renders/industrial_pipe_lamp/clay.png?height=900&quality=95&v=f1e4be54',
      status: 'Visual standalone single circular base confirmed from the official clay preview; unchanged-policy contact validation remains separate.',
      visualEvidence: 'Official clay preview viewed in the real browser on 2026-10-07: one complete round base, no clamp or projecting bottom bolt; hex/bolt connectors are above the base at the pipe joint.',
      physicalMeaning: 'Source and preview provide no physical stability guarantee or guarantee that fastening is unnecessary. Visual category review is not geometric contact or real-world stability validation.',
      noAssetSpecificContactOverrides: true,
      excludedOriginal: { id: 'desk_lamp_arm_01', source: 'https://polyhaven.com/a/desk_lamp_arm_01', reason: 'Official clamp-mounted lamp; the first analysis found only a 3.527 mm bottom contact patch, which does not establish a freestanding lamp base.' },
      heldOutMeaning: 'The same three registered tables are rerun with this independently registered lamp. This is not a new unseen table test set and does not erase the first semantic failure.',
    },
    rejected: [],
  };
  try {
    Object.assign(manifest, await prepareAsset(selectedLamp));
    console.log(`Prepared ${selectedLamp.id}: ${manifest.runtimeBytes} runtime bytes. Contact geometry not analyzed.`);
  } catch (error) {
    manifest.status = 'source-preparation-rejected';
    manifest.rejected.push({ id: selectedLamp.id, stage: 'source-preparation', reason: error.message, hiddenOrReplaced: false });
    console.error(`Rejected ${selectedLamp.id}: ${error.message}`);
    process.exitCode = 1;
  }
  await mkdir(target, { recursive: true });
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
} else {
  const manifest = {
    schemaVersion: 1,
    product: 'ATELIER · 新桌支撑研究',
    preparedAt: '2026-10-07',
    status: 'source-assets-prepared-geometric-validation-separate',
    runtimeNetwork: 'local-only',
    provenance: 'Independent original Poly Haven designs, unmodified source glTF/bin/1k textures. Asset preparation runs no support detection.',
    normalization: {
      policyVersion: 'table-height-075-v1',
      upAxis: '+Y',
      sourceUnit: 'meter',
      unitAuthority: 'https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units',
      targetDesignHeightMeters: 0.75,
      rule: 'After all source-node transforms: s = 0.75 / (maxY - minY); x,z translate by negative bounding-box center times s; y translate by -minY times s; apply one positive uniform scale.',
      heightMeaning: 'A shared product design height; neither a measured table height nor an inferred source unit.',
      matrixRecord: 'Computed by the shared extraction adapter and recorded in geometric validation evidence, never assigned per asset here.',
    },
    license: { id: 'CC0-1.0', authority: 'https://polyhaven.com/license', apiAuthority: 'https://polyhaven.com/our-api', credit: 'Table assets by Poly Haven and their listed artists.' },
    selectionProtocol: {
      independentDesignsRequired: 3,
      previouslyAdaptedExcluded: ['modern_coffee_table_01', 'modern_coffee_table_02'],
      selectedBeforeSupportAnalysis: true,
      assetSpecificGeometryOverrides: false,
      geometricValidationStatus: 'Run separately after the shared rule is frozen; preparing an asset is not a successful placement test.',
      negativeCases: 'A true tabletop hole or concave boundary is not claimed from these source descriptions; separate geometry fixtures must be labelled as such.',
    },
    assets: [],
    rejected: [],
  };
  await mkdir(target, { recursive: true });
  for (const selection of selected) {
    try {
      manifest.assets.push(await prepareAsset(selection));
      console.log(`Prepared ${selection.id}: ${manifest.assets.at(-1).runtimeBytes} runtime bytes.`);
    } catch (error) {
      manifest.rejected.push({ id: selection.id, sourcePage: `https://polyhaven.com/a/${selection.id}`, stage: 'source-preparation', reason: error.message, hiddenOrReplaced: false });
      console.error(`Rejected ${selection.id}: ${error.message}`);
    }
  }
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  if (manifest.rejected.length || manifest.assets.length < selected.length) process.exitCode = 1;
}

async function prepareAsset(selection) {
  const metadataFiles = [], documents = {};
  for (const endpoint of ['info', 'files']) {
    const result = await readOrDownload(`assets/source-metadata/${selection.id}-${endpoint}.json`, `https://api.polyhaven.com/${endpoint}/${selection.id}`);
    metadataFiles.push(result.record);
    documents[endpoint] = JSON.parse(result.bytes.toString('utf8'));
  }
  const source = documents.files.gltf?.['1k']?.gltf;
  if (!source?.url) throw new Error('Official 1k glTF export unavailable');
  const totalExpected = source.size + Object.values(source.include ?? {}).reduce((sum, file) => sum + file.size, 0);
  if (!Number.isSafeInteger(totalExpected) || totalExpected > 10 * 1024 * 1024) throw new Error('Official package exceeds 10 MiB preparation budget');
  const modelPath = `assets/models/${selection.id}/${selection.id}.gltf`;
  const model = await readOrDownload(modelPath, source.url, source), files = [model.record];
  for (const [relative, included] of Object.entries(source.include ?? {}).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const resource = await readOrDownload(`assets/models/${selection.id}/${relative}`, included.url, included);
    files.push(resource.record);
  }
  const document = JSON.parse(model.bytes.toString('utf8')), structure = inspectStaticDocument(document);
  for (const item of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (!item.uri || !files.some(file => file.path === `assets/models/${selection.id}/${item.uri}`)) throw new Error(`Missing/unregistered external reference: ${item.uri}`);
  }
  return {
    ...selection, name: documents.info.name, modelPath,
    format: 'gltf-2.0-static-external-local', sourcePage: `https://polyhaven.com/a/${selection.id}`,
    license: 'CC0-1.0', authors: documents.info.authors,
    sourceUnit: 'meter (glTF 2.0 coordinate convention; no measured-height claim)',
    sourceFingerprint: packageFingerprint(files),
    sourceFingerprintAlgorithm: 'SHA-256 of UTF-8 path:sha256 LF lines sorted by en locale path, includes all unmodified runtime source files.',
    runtimeBytes: files.reduce((sum, file) => sum + file.bytes, 0), metadataFiles, files, structure,
  };
}
