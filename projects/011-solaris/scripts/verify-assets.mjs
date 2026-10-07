import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../web/studio/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('assets/manifest.json', root), 'utf8'));
const unique = new Set();
let totalBytes = 0, referencedFiles = 0;
for (const item of manifest.files) {
  if (unique.has(item.file)) throw new Error(`重复清单项：${item.file}`);
  unique.add(item.file);
  const url = new URL(item.file, root);
  if (!url.href.startsWith(root.href)) throw new Error(`清单路径越界：${item.file}`);
  const bytes = await fs.readFile(url);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== item.bytes || hash !== item.sha256) throw new Error(`文件版本不匹配：${item.file}`);
  totalBytes += bytes.length;
  if (item.file.endsWith('.gltf')) {
    const data = JSON.parse(bytes.toString('utf8'));
    for (const entry of [...(data.buffers || []), ...(data.images || [])]) {
      if (!entry.uri || entry.uri.startsWith('data:')) continue;
      const reference = new URL(entry.uri, url);
      if (!reference.href.startsWith(root.href)) throw new Error(`资产引用越界：${item.file}`);
      await fs.access(reference); referencedFiles++;
    }
  }
}
console.log(JSON.stringify({ files: unique.size, bytes: totalBytes, referencedFiles, hashes: 'passed', gltfReferences: 'passed' }, null, 2));
