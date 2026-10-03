import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Fixed upstream tag, with locally served modules: no runtime CDN dependency.
const base = 'https://raw.githubusercontent.com/mrdoob/three.js/r180/';
const target = new URL('../web/vendor/', import.meta.url);
await mkdir(target, { recursive: true });
const files = ['build/three.module.js', 'build/three.core.js', 'LICENSE'];
const manifest = { package: 'three', version: '0.180.0', tag: 'r180', files: [] };
for (const file of files) {
  const response = await fetch(base + file);
  if (!response.ok) throw new Error(`Download ${file}: ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  const name = file.split('/').at(-1);
  await writeFile(new URL(name, target), data);
  manifest.files.push({ file: name, source: base + file, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length });
}
await writeFile(new URL('manifest.json', target), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Three.js r180 vendored to ${fileURLToPath(target)}`);
