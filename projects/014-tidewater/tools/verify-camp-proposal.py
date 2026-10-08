"""Independently reopen a real camp archive with Python ZIP/CRC/SHA readers."""
import argparse, hashlib, json, pathlib, re, zipfile

def sha(data):
    return hashlib.sha256(data).hexdigest()

parser=argparse.ArgumentParser()
parser.add_argument('id')
parser.add_argument('--output',default='camp-proposal-delivery-results.json')
parser.add_argument('--expected-fingerprint')
parser.add_argument('--expected-entities',type=int)
parser.add_argument('--expected-variants',type=int)
args=parser.parse_args()
if not re.fullmatch(r'[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}',args.id):
    raise ValueError('Expected publication UUID')
root=pathlib.Path(__file__).resolve().parent.parent
source=root/'web/assets/camp-proposals'/args.id
destination=(root/'.runtime'/('camp-proposal-verify-'+args.id[:8])).resolve()
assert destination.is_relative_to((root/'.runtime').resolve())
manifest=json.loads((source/'delivery-manifest.json').read_bytes())
assert manifest['format']=='tidewater-camp-delivery.v1'
expected={item['path']:item for item in manifest['files']}
assert len(expected)==len(manifest['files'])
files=[]
with zipfile.ZipFile(source/'project.zip') as archive:
    assert archive.testzip() is None
    names=archive.namelist()
    assert len(names)==len(set(names))
    assert set(names)==set(expected)|{'delivery-manifest.json'}
    for name in names:
        assert not re.search(r'[\\\x00-\x1f\x7f:]',name)
        assert not name.startswith('/') and all(p not in ('','.','..') for p in name.split('/'))
        target=(destination/name).resolve()
        assert target.is_relative_to(destination)
        data=archive.read(name)
        assert data==(source/name).read_bytes()
        if name in expected:
            assert len(data)==expected[name]['bytes'] and sha(data)==expected[name]['sha256']
        target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists():
            assert target.read_bytes()==data
        else:
            target.write_bytes(data)
        files.append({'path':name,'bytes':len(data),'sha256':sha(data),'passed':True})
proposal=json.loads((destination/'proposal.json').read_bytes())
assert proposal['id']==manifest['proposalId']
assert len(proposal['variants'])==len(manifest['variants'])
if args.expected_variants is not None: assert len(proposal['variants'])==args.expected_variants
if args.expected_entities is not None: assert len(proposal['sourcePlan']['entities'])==args.expected_entities
if args.expected_fingerprint: assert manifest['sourceFingerprint']==args.expected_fingerprint
assert {o['id'] for o in proposal['objects']}=={e['id'] for e in proposal['sourcePlan']['entities']}
source_json=proposal['sourcePlan']
for variant in proposal['variants']:
    assert variant['candidate']['sourcePlan']==source_json
    assert variant['candidate']['geometry']['sourceFingerprint']==manifest['sourceFingerprint']
    if variant['candidate'].get('fineEdit'): assert variant['candidate']['fineEdit']['preservedOutsideScope']
    assert (destination/f"glb/{variant['id']}.glb").stat().st_size>28
report={'format':'tidewater-camp-proposal-disk-check.v1','passed':True,'publicationId':args.id,'source':str(source),'extraction':str(destination),'method':'Python ZipFile CRC, exact inventory and independent SHA-256; actual fine scene GLBs verified separately','sourceFingerprint':manifest['sourceFingerprint'],'variantCount':len(proposal['variants']),'sourceEntityCount':len(proposal['sourcePlan']['entities']),'stayCount':len([o for o in proposal['objects'] if o['role']=='stay']),'zipBytes':(source/'project.zip').stat().st_size,'zipSha256':sha((source/'project.zip').read_bytes()),'files':files,'visualQuality':'needs-review'}
assert re.fullmatch(r'[a-z0-9-]+\.json',args.output)
(root/'checks'/args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False))
