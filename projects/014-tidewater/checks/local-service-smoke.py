"""Check the running loopback API and published assets without starting GPU jobs."""
import hashlib, json, pathlib
import requests

PROJECT = pathlib.Path(__file__).resolve().parents[1]
WEB = PROJECT / 'web'
API = 'http://127.0.0.1:4197'
ORIGIN = 'http://127.0.0.1:4196'
results = []

def record(name, ok, evidence):
    results.append({'name': name, 'passed': bool(ok), 'evidence': evidence})

health = requests.get(API + '/health', timeout=10)
record('local CUDA backend is actually ready', health.status_code == 200 and health.json().get('status') == 'ready', health.json())
transparent = (WEB / 'assets/neural/boat-reference-v1.png').read_bytes()
opaque = (WEB / 'realistic/assets/textures/wood_floor-diff.jpg').read_bytes()
cases = [
    ('reject foreign origin before queuing', {'Origin': 'https://example.invalid'}, 'boat', b'', 403),
    ('reject missing origin before queuing', {}, 'boat', b'', 403),
    ('reject an unexpected Host header', {'Origin': ORIGIN, 'Host': 'example.invalid:4197'}, 'boat', b'', 403),
    ('reject unsupported kind', {'Origin': ORIGIN}, 'terrain', b'', 400),
    ('report missing background segmentation honestly', {'Origin': ORIGIN}, 'boat', opaque, 400),
]
for name, headers, kind, image, expected_status in cases:
    response = requests.post(API + '/tasks', headers=headers, data={'kind': kind}, files={'image': ('reference.png', image)}, timeout=10)
    body = response.json()
    record(name, response.status_code == expected_status and 'taskId' not in body and bool(body.get('error')), {'http': response.status_code, 'body': body})

catalog = json.loads((WEB / 'assets/neural/world-assets-v1.json').read_text(encoding='utf-8-sig'))
for item in catalog['assets']:
    response = requests.get(ORIGIN + item['url'], timeout=20)
    digest = hashlib.sha256(response.content).hexdigest()
    record('HTTP published ' + item['kind'] + ' matches genuine GLB', response.status_code == 200 and len(response.content) == item['bytes'] and digest == item['sha256'], {'bytes': len(response.content), 'sha256': digest})

for version, manifest_path in [
    ('2026-10-05-realistic-material-v1', PROJECT / 'versions/2026-10-05-realistic-material-v1/manifest.json'),
    ('2026-10-05-neural-cabin-v1', WEB / 'versions/2026-10-05-neural-cabin-v1/snapshot-manifest.json'),
]:
    manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    directory = WEB / 'versions' / version
    mismatches = []
    for item in manifest['files']:
        target = directory / item['path']
        if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != item['sha256']:
            mismatches.append(item['path'])
    record('frozen playable ' + version + ' retains exact files', not mismatches, {'checkedFiles': len(manifest['files']), 'mismatches': mismatches})

output = {'format': 'tidewater-local-service-smoke.v1', 'startsInference': False, 'results': results}
(PROJECT / 'checks/local-service-smoke-results.json').write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'passed': sum(r['passed'] for r in results), 'total': len(results), 'failed': [r for r in results if not r['passed']]}, ensure_ascii=False))
if not all(r['passed'] for r in results): raise SystemExit(1)
