"""Hashes final authored rigid footwear and complete retained original reference."""
from pathlib import Path
import hashlib,json
root=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris');arc=root/'assets/fitting-footwear-source-archives';out=root/'web/fitting/footwear'
def entry(path,role,runtime=False):
 p=out/path if runtime else root/path;b=p.read_bytes();return {('path' if runtime else 'repositoryPath'):str(path).replace('\\','/'),'role':role,'byteLength':len(b),'sha256':hashlib.sha256(b).hexdigest()}
old=json.loads((root/'web/fitting/assets/manifest.json').read_text());f=[]
for path,role in [('court.glb','runtime-court-pair'),('ridge.glb','runtime-ridge-pair'),('fit-registration.json','finite-foot-registration'),('quaternius-cc0-license.txt','source-license-copy')]:f.append(entry(path,role,True))
for path,role in [('avatar.glb','frozen-complete-reference-avatar'),('core-tee.glb','frozen-c17-tee'),('field-jacket.glb','frozen-c17-jacket')]:f.append(entry('web/fitting/assets/'+path,role))
for e in old['files']:
 if e['role'] in ['original-archive','original-body-glb','source-topology-snapshot']:f.append(entry(e['repositoryPath'],e['role']))
for p,role in [('build_footwear.py','original-footwear-build-recipe'),('inspect_feet.py','original-foot-registration-recipe'),('review_footwear.py','actual-avatar-review-recipe'),('build_manifest.py','local-source-registration-recipe'),('atelier-footwear-complete.blend','complete-editable-paired-shoes-and-original-avatar'),('avatar-feet-inspection.json','actual-avatar-foot-registration'),('finite-foot-verification.json','finite-packed-foot-verification')]:f.append(entry('assets/fitting-footwear-source-archives/'+p,role))
for p in sorted(arc.glob('*-review.png')):f.append(entry('assets/fitting-footwear-source-archives/'+p.name,'actual-avatar-view'))
report=json.loads((arc/'finite-foot-verification.json').read_text())
m={'schema':1,'date':'2026-10-06','purpose':'Local mouse-operated fixed-avatar paired three-dimensional footwear fitting; no external model inference or image try-on.',
 'source':old['source'],
 'authoredAdditions':{'externalFootwearAssets':False,'geometry':'Original complete left/right court shoes and ankle boots: continuous cubic last, independent leather shells with real elliptical ankle openings, hollow boot quarter, closed rounded soles, separately projected toe/quarter/heel panels and tongue, padded rim/lining, actual lace curves, metal eyelets, sidewall grooves and heel pull details. Rubber block geometry is embedded within the flat registered sole and does not imply traction physics.',
 'copyrightScope':'Complete Quaternius CC0 mannequin reused unchanged from frozen C17 runtime; every shoe shell, sole, panel, lace, hardware shape and PBR material authored locally without external shoe mesh or brand artwork.',
 'registration':'Rigid full pairs at original foot anchors. Packed original avatar foot points independently evaluated in both finite poses and confirmed stationary. Shoes deliberately have no duplicated rig or gait clips.',
 'pipeline':'Editable Blender 5.2.2 LTS model, Python build/inspection/review/registration recipes, final GLBs and full original source archive retained locally outside web except small runtime GLBs/license/registration/manifest.'},
 'runtime':{'avatar':'../assets/avatar.glb','footwear':[{'id':'court-01','path':'court.glb','name':'Court','category':'shoes'},{'id':'boot-01','path':'ridge.glb','name':'Ridge','category':'shoes'}],
 'up':'+Y','front':'+Z','outerScale':1,'outerOrigin':[0,0,0],'groundY':0,'virtualReferenceHeight':1.78,'bodyMasks':False,'realMeasurementClaim':False,'gaitSupported':False,'externalRequests':0,
 'materialInstructions':'Only Fitting_ShoeUpper is recolorable. Sole, rubber, trim/lining, cotton laces, stitches and metallic eyelets retain separate fixed PBR materials.',
 'poseInstructions':'Load paired footwear gltf.scene directly under avatar outer root with scale 1. Rigid pairs need no AnimationMixer; original avatar and garments retain Fitting_Neutral / Fitting_Reach setTime(0). Original feet and all body meshes remain visible, with no mask or replacement body geometry.',
 'finiteVerification':{'checks':9,'status':'passed-with-finite-foot-domain','geometryChecksStored':report['checks'],'originalFootSamplesPerPair':264,'groundProjectionHitsPerPair':264,'outsidePortalUpwardHitsPerPair':120,'declaredOpenAnklePortalSamplesPerPair':144,'ridgeLowerShinSamples':2830,'ridgeLowerShinCovered':2830,'shaftHeightDomain':[.155,.284],'registeredPoses':['neutral','reach'],'reviewImages':18,
 'limits':'Fixed original 1.78 virtual reference body and two stationary-foot poses only. Foot samples are unique packed body points with Y<0.155. All floor projections are tested. Vertical upper rays are tested only outside the actual elliptical ankle opening; its 144 samples are explicitly declared open. Ridge lower-shin radial shell probes use Y in [0.155,0.284] and include original vertices plus 8th-order barycentric samples of every body triangle crossing the domain. Not a volumetric collision certificate, production shoe last, foot/sole padding simulation, real sizing, walk cycle, cloth or friction solver.'}},'files':f}
assert len([e for e in f if e['role']=='actual-avatar-view'])==18
(out/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
print(json.dumps({'registeredFiles':len(f),'runtimeBytes':sum(e['byteLength']for e in f if 'path'in e),'sha':{e.get('path'):e['sha256']for e in f if e['role'].startswith('runtime-')}},indent=2))
