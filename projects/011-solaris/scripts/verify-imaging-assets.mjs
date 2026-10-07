import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const directory = new URL('../web/assets/imaging/', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', directory), 'utf8'));
if (manifest.version !== 1 || manifest.assets.length !== 2) throw new Error('Unexpected imaging asset manifest');

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) throw new Error('Invalid JPEG start/end');
  let offset = 2;
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker boundary');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) throw new Error('Truncated JPEG segment');
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error('Invalid JPEG segment length');
    const isFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame) {
      if (length < 8) throw new Error('Truncated JPEG frame');
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3), precision: bytes[offset + 2] };
    }
    offset += length;
  }
  throw new Error('Missing JPEG frame');
}

const checks = [];
for (const asset of manifest.assets) {
  if (!/^[a-z-]+\.jpg$/.test(asset.file)) throw new Error('Invalid local imaging path');
  if (asset.mimeType !== 'image/jpeg' || asset.license !== 'CC0-1.0' || asset.author !== 'Mikael Häggström') throw new Error('Unexpected image provenance');
  if (!asset.sourcePage.startsWith('https://commons.wikimedia.org/wiki/File:') || !asset.sourceRevision.includes('&oldid=') || !asset.sourceDownload.startsWith('https://upload.wikimedia.org/wikipedia/commons/')) throw new Error('Missing primary provenance');
  if (asset.pixelSpacing !== null || asset.calibration !== 'unknown' || asset.defaultMeasurementUnit !== 'px' || asset.clinicalInterpretation !== false) throw new Error('Imaging samples must start uncalibrated without clinical interpretation');
  const bytes = await fs.readFile(new URL(asset.file, directory));
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== asset.bytes || sha256 !== asset.sha256) throw new Error(`Imaging checksum mismatch: ${asset.file}`);
  const dimensions = jpegDimensions(bytes);
  if (dimensions.width !== asset.width || dimensions.height !== asset.height || dimensions.precision !== 8) throw new Error(`Imaging frame mismatch: ${asset.file}`);
  checks.push({ id: asset.id, file: asset.file, width: asset.width, height: asset.height, bytes: bytes.length, sha256, license: asset.license, defaultMeasurementUnit: asset.defaultMeasurementUnit });
}
if ((await fs.readFile(new URL('credits.md', directory), 'utf8')).length < 500) throw new Error('Missing readable imaging credits');
console.log(JSON.stringify({ images: checks.length, originalJpegFiles: true, localRuntimeFiles: true, unknownPixelSpacing: true, checks }, null, 2));
