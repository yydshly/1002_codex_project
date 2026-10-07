import { SCENES, validateCheckpoint } from './core.js';

const TRIP_KEY = 'atelier-collection-trip-v1';
const TOKEN = /^[a-f0-9]{16}$/;
const productRoot = new URL('../', import.meta.url);
const canonicalPath = path => path.endsWith('/') ? `${path}index.html` : path;

// The bridge only reads a validated checkpoint. Scene state belongs to each app.
export function resolveSceneReturn(href, checkpointText, root = productRoot) {
  try {
    if (typeof checkpointText !== 'string' || checkpointText.length > 256 * 1024) return null;
    const current = new URL(href), base = new URL(root);
    if (!['http:', 'https:'].includes(current.protocol) || current.origin !== base.origin) return null;
    const from = current.searchParams.getAll('from'), trips = current.searchParams.getAll('trip');
    if (from.length !== 1 || from[0] !== 'collection' || trips.length !== 1 || !TOKEN.test(trips[0])) return null;
    const checkpoint = validateCheckpoint(JSON.parse(checkpointText));
    if (checkpoint.token !== trips[0]) return null;
    const scene = SCENES[checkpoint.sceneId];
    if (!scene) return null;
    const registered = new URL(scene.path, base);
    if (registered.origin !== current.origin || canonicalPath(registered.pathname) !== canonicalPath(current.pathname)) return null;
    return { href: `./collection.html?resume=${checkpoint.token}`, sceneId: checkpoint.sceneId, token: checkpoint.token };
  } catch {
    return null;
  }
}

function showSceneReturn() {
  let result;
  try { result = resolveSceneReturn(window.location.href, window.localStorage.getItem(TRIP_KEY)); }
  catch { return; }
  if (!result || document.getElementById('collection-return-bridge')) return;
  const bridge = document.createElement('nav');
  bridge.id = 'collection-return-bridge';
  bridge.setAttribute('aria-label', '选品台往返');
  Object.assign(bridge.style, {
    position: 'fixed', top: '78px', right: '18px', zIndex: '900',
    display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
    maxWidth: 'calc(100vw - 36px)', boxSizing: 'border-box', padding: '7px 12px',
    background: 'rgba(255, 253, 248, .97)', color: '#4d574e',
    border: '1px solid #bfc7ba', borderRadius: '8px',
    boxShadow: '0 3px 14px rgba(34, 43, 35, .10)', font: '500 12px/1.4 system-ui, sans-serif',
  });
  const context = document.createElement('span');
  context.textContent = '从选品台进入';
  Object.assign(context.style, { color: '#697167', font: 'inherit' });
  const back = document.createElement('a');
  back.textContent = '返回选品台 ↗';
  back.href = result.href;
  back.setAttribute('aria-label', '返回选品台，恢复进入场景前的陈列');
  Object.assign(back.style, { color: '#234b35', font: '600 12px/1.4 system-ui, sans-serif', textDecoration: 'underline', textUnderlineOffset: '3px', padding: '3px 0', whiteSpace: 'nowrap' });
  bridge.append(context, back);
  document.body.append(bridge);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') showSceneReturn();
