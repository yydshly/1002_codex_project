import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../web/assets/creative/', import.meta.url));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
const expected = new Map([['cat-fur', null], ['wheat-cypresses', 436535], ['river-bridge', 437680], ['still-life', 435882]]);
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
function safeFile(relative) {
  assert.equal(typeof relative, 'string');
  assert.ok(!relative.includes('\\') && !relative.startsWith('/') && !relative.split('/').includes('..') && !/^[a-z]+:/i.test(relative));
  const filename = path.resolve(root, relative);
  assert.ok(filename.startsWith(path.resolve(root) + path.sep));
  return filename;
}
function jpegInfo(data) {
  assert.equal(data.readUInt16BE(0), 0xffd8, 'JPEG signature');
  assert.equal(data.readUInt16BE(data.length - 2), 0xffd9, 'JPEG end marker');
  let offset = 2, frame = null;
  const profiles = [];
  while (offset + 4 < data.length) {
    assert.equal(data[offset++], 0xff);
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = data.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= data.length, 'Complete JPEG segment');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const channels = data[offset + 7];
      frame = { width: data.readUInt16BE(offset + 5), height: data.readUInt16BE(offset + 3), channels };
      assert.equal(data[offset + 2], 8, '8-bit JPEG');
      for (let channel = 0; channel < channels; channel++) assert.equal(data[offset + 9 + channel * 3], 0x11, '4:4:4 chroma sampling');
    }
    if (marker === 0xe2 && data.subarray(offset + 2, offset + 14).toString('ascii') === 'ICC_PROFILE\0') profiles.push({ order: data[offset + 14], count: data[offset + 15], bytes: data.subarray(offset + 16, offset + length) });
    offset += length;
  }
  assert.ok(frame && profiles.length, 'RGB frame and embedded ICC profile');
  profiles.sort((a, b) => a.order - b.order);
  assert.ok(profiles.every((value, index) => value.order === index + 1 && value.count === profiles.length));
  const profile = Buffer.concat(profiles.map(value => value.bytes));
  assert.equal(profile.subarray(36, 40).toString('ascii'), 'acsp', 'ICC signature');
  assert.equal(profile.subarray(16, 20).toString('ascii'), 'RGB ', 'RGB colour profile');
  return frame;
}
let decoder = null;
if (process.env.CREATIVE_NODE_PACKAGES) decoder = createRequire(path.join(process.env.CREATIVE_NODE_PACKAGES, '../package.json'))('sharp');
assert.equal(manifest.version, 1);
assert.equal(manifest.license, 'CC0-1.0');
assert.equal(manifest.runtimeRequiresNetwork, false);
assert.deepEqual(manifest.images.map(image => image.id).sort(), [...expected.keys()].sort());
let totalBytes = 0;
const localFiles = new Set();
for (const image of manifest.images) {
  assert.equal(image.license, 'CC0-1.0');
  assert.equal(image.file, `${image.id}.jpg`);
  for (const field of ['id', 'file', 'author', 'title', 'year', 'sourcePage', 'sha256']) assert.ok(typeof image[field] === 'string' && image[field].length > 0, field);
  assert.equal(image.sourcePage, image.source);
  assert.equal(image.mimeType, 'image/jpeg');
  assert.equal(image.colourspace, 'srgb');
  assert.equal(image.hasIccProfile, true);
  assert.equal(image.channels, 3);
  assert.equal(image.original.url, image.download);
  assert.match(image.original.sha256, /^[a-f0-9]{64}$/);
  assert.ok(image.original.bytes > 0);
  assert.equal(image.derivation.tool, 'sharp');
  assert.equal(image.derivation.reproducedBy, 'download.mjs');
  assert.equal(image.derivation.steps.length, 5);
  assert.match(image.derivation.steps[1], /full image composition; no crop/);
  assert.ok(Math.max(image.width, image.height) === 2400 && Math.min(image.width, image.height) >= 1600);
  assert.ok(image.width <= image.original.width && image.height <= image.original.height);
  assert.ok(Math.abs(image.width / image.height - image.original.width / image.original.height) < 1 / Math.min(image.width, image.height), 'Preserved full-frame aspect ratio');
  const data = await fs.readFile(safeFile(image.file));
  assert.equal(data.length, image.bytes);
  assert.equal(sha256(data), image.sha256, `SHA-256 ${image.file}`);
  assert.deepEqual(jpegInfo(data), { width: image.width, height: image.height, channels: image.channels });
  if (decoder) {
    const { info } = await decoder(data).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, image.width); assert.equal(info.height, image.height); assert.equal(info.channels, 3);
  }
  totalBytes += data.length; localFiles.add(image.file);
  if (expected.get(image.id)) {
    assert.equal(image.objectID, expected.get(image.id));
    assert.equal(image.sourcePage, `https://www.metmuseum.org/art/collection/search/${image.objectID}`);
    assert.equal(image.licenseSource, 'https://www.metmuseum.org/hubs/open-access');
    assert.ok(image.download.startsWith('https://images.metmuseum.org/CRDImages/ep/original/'));
    const raw = await fs.readFile(safeFile(image.sourceApiFile));
    assert.equal(raw.length, image.sourceApiBytes); assert.equal(sha256(raw), image.sourceApiSha256);
    const document = JSON.parse(raw);
    assert.equal(document.objectID, image.objectID); assert.equal(document.isPublicDomain, true);
    assert.equal(document.primaryImage, image.download); assert.equal(document.artistDisplayName, image.author); assert.equal(document.title, image.title);
    localFiles.add(image.sourceApiFile);
  } else {
    assert.equal(image.author, 'OboeBlanket');
    assert.equal(image.sourcePage, 'https://commons.wikimedia.org/wiki/File:Cat_in_towel.jpg');
    assert.equal(image.original.url, 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Cat_in_towel.jpg');
    assert.equal(image.licenseName, 'CC0 1.0 Universal Public Domain Dedication');
    assert.ok(image.copyrightStatement.includes('copyright holder'));
  }
}
assert.equal(totalBytes, manifest.totalBytes);
assert.ok(totalBytes <= manifest.imageBudgetBytes && manifest.imageBudgetBytes <= 8 * 1024 * 1024);
assert.equal(localFiles.size, 7);
console.log(`Creative assets verified: 4 local CC0 JPEGs, ${totalBytes} image bytes, 2400px full-frame derivatives, RGB ICC profiles and 4:4:4 chroma, all local SHA-256 digests, 3 captured Met isPublicDomain:true source records${decoder ? ', all pixels decoded with sharp' : ''}. No runtime network required.`);
