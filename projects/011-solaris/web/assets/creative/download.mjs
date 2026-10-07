// Build-time provenance utility. Runtime uses only the local JPEG files.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const bundledPackages = process.env.CREATIVE_NODE_PACKAGES;
const require = createRequire(bundledPackages ? path.join(bundledPackages, '../package.json') : import.meta.url);
const sharp = require('sharp');
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const policy = 'https://www.metmuseum.org/hubs/open-access';
async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Atelier-OpenAssets/0.7.0 (local attribution archive)' }, signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
const specs = [
  { id: 'cat-fur', file: 'cat-fur.jpg', role: 'material-reference', title: 'Cat in towel', titleZh: '毛巾中的猫', author: 'OboeBlanket', date: '2013-06-08', source: 'https://commons.wikimedia.org/wiki/File:Cat_in_towel.jpg', download: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Cat_in_towel.jpg', licenseSource: 'https://commons.wikimedia.org/wiki/File:Cat_in_towel.jpg#Licensing', sourceMedium: 'digital photograph', copyrightStatement: 'I, the copyright holder of this work, hereby publish it under the following license:', licenseName: 'CC0 1.0 Universal Public Domain Dedication' },
  { id: 'wheat-cypresses', file: 'wheat-cypresses.jpg', role: 'brush-reference', objectID: 436535, titleZh: '麦田与柏树' },
  { id: 'river-bridge', file: 'river-bridge.jpg', role: 'brush-reference', objectID: 437680, titleZh: '维勒讷夫拉加伦桥' },
  { id: 'still-life', file: 'still-life.jpg', role: 'composition-base', objectID: 435882, titleZh: '苹果与报春花盆静物' }
];
await fs.mkdir(path.join(root, 'provenance'), { recursive: true });
const metadata = await Promise.allSettled(specs.map(async spec => {
  if (!spec.objectID) return { ...spec };
  const api = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${spec.objectID}`;
  const raw = await fetchBytes(api), source = JSON.parse(raw);
  if (source.isPublicDomain !== true || !source.primaryImage.startsWith('https://images.metmuseum.org/')) throw new Error(`No Open Access original for ${spec.objectID}`);
  return { ...spec, title: source.title, author: source.artistDisplayName, date: source.objectDate, source: source.objectURL, download: source.primaryImage, licenseSource: policy, sourceMedium: source.medium, accessionNumber: source.accessionNumber, creditLine: source.creditLine, physicalDimensions: source.dimensions, sourceApi: api, sourceApiFile: `provenance/met-${spec.objectID}.json`, sourceApiBytes: raw.length, sourceApiSha256: sha256(raw), sourceApiRaw: raw };
}));
for (const result of metadata) if (result.status === 'rejected') throw result.reason;
const downloaded = await Promise.allSettled(metadata.map(async result => {
  const spec = result.value;
  const original = await fetchBytes(spec.download), originalMetadata = await sharp(original).metadata();
  const image = await sharp(original).rotate().resize(2400, 2400, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' }).toColourspace('srgb').withIccProfile('srgb').jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
  const details = await sharp(image).metadata();
  if (Math.max(details.width, details.height) < 1600) throw new Error(`Insufficient source resolution: ${spec.id}`);
  return { spec, image, imageRecord: { ...spec, year: spec.date.match(/\d{4}/)?.[0] ?? spec.date, sourcePage: spec.source, license: 'CC0-1.0', bytes: image.length, sha256: sha256(image), width: details.width, height: details.height, channels: details.channels, colourspace: details.space, hasIccProfile: details.hasProfile, mimeType: 'image/jpeg', original: { url: spec.download, bytes: original.length, sha256: sha256(original), width: originalMetadata.width, height: originalMetadata.height, channels: originalMetadata.channels, colourspace: originalMetadata.space, orientation: originalMetadata.orientation ?? 1, hasIccProfile: originalMetadata.hasProfile }, derivation: { tool: 'sharp', sharpVersion: sharp.versions.sharp, libvipsVersion: sharp.versions.vips, steps: ['Apply source EXIF orientation', 'Preserve the full image composition; no crop, segmentation, repaint, AI processing, colour grading or content replacement', 'Resize inside a 2400 by 2400 box using Lanczos3; never enlarge', 'Convert to sRGB and embed its ICC profile', 'Encode JPEG quality 92 with 4:4:4 chroma sampling'], reproducedBy: 'download.mjs' }, visualReview: 'pending-root-review' } };
}));
for (const result of downloaded) if (result.status === 'rejected') throw result.reason;
const totalBytes = downloaded.reduce((sum, result) => sum + result.value.image.length, 0);
if (totalBytes > 8 * 1024 * 1024) throw new Error(`Image budget exceeded: ${totalBytes} bytes`);
for (const { value: { spec, image } } of downloaded) {
  await fs.writeFile(path.join(root, spec.file), image);
  if (spec.sourceApiRaw) await fs.writeFile(path.join(root, spec.sourceApiFile), spec.sourceApiRaw);
}
const images = downloaded.map(({ value: { imageRecord } }) => { const { sourceApiRaw, ...record } = imageRecord; return record; });
await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ version: 1, license: 'CC0-1.0', runtimeRequiresNetwork: false, imageBudgetBytes: 8 * 1024 * 1024, totalBytes, checkedDate: '2026-10-05', images }, null, 2) + '\n');
console.log(JSON.stringify({ totalBytes, images: images.map(({ id, file, width, height, bytes }) => ({ id, file, width, height, bytes })) }, null, 2));
