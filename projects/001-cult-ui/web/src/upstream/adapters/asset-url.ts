import publicAssets from "../public-assets.json";
const knownAssets = new Set(publicAssets);
// Only rewrite assets that are present in the fixed repository's public folder.
// Application routes, /api paths, data URLs and remote URLs are kept unchanged.
export function assetUrl(value: string): string {
  return value.startsWith("/") && knownAssets.has(value.split(/[?#]/)[0]) ? `.${value}` : value;
}
