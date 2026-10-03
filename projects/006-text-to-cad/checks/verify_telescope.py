"""Independent specification checks on saved STEP; no model-source imports."""
from __future__ import annotations
from datetime import datetime, timezone
from hashlib import sha256
from itertools import combinations
import json
from math import pi, sqrt
from pathlib import Path
import sys
from cadgen import build123d as bd, read_scene
from cadgen.geometry import closest_points, overlap_volume

ROOT = Path(__file__).resolve().parents[1]
TOL = 1e-5
VOLUME_TOL = 1e-3
FOCUS_LABELS = {'focus_drawtube', 'eyepiece_barrel', 'eyepiece_glass', 'eyecup'}
EXPECTED_BOXES = {
    'pedestal': ((120, -80, 0), (300, 80, 225)),
    'mount_yoke': ((165, -70, 225), (255, 70, 325)),
    'telescope_tube': ((0, -43, 312), (420, 43, 398)),
    'objective_cell': ((-12, -48, 307), (16, 48, 403)),
    'objective_glass': ((-6-(160-sqrt(160**2-35**2)), -35, 320), (-6+(160-sqrt(160**2-35**2)), 35, 390)),
    'telescope_focuser': ((404, -45, 310), (446, 45, 400)),
    'focus_drawtube': ((414, -20.75, 334.25), (494, 20.75, 375.75)),
    'eyepiece_barrel': ((486, -24, 331), (522, 24, 379)),
    'eyepiece_glass': ((501, -14, 341), (505, 14, 369)),
    'eyecup': ((522, -26, 329), (534, 26, 381)),
    'telescope_cradle': ((140, -67, 295), (280, 67, 404)),
}

def main():
    checks=[]
    files=[]
    def check(name, observed, expected, passed=None, units=None, tolerance=TOL):
        if passed is None:
            passed=abs(observed-expected) <= tolerance
        row={'name':name,'observed':observed,'expected':expected,'status':'pass' if passed else 'fail'}
        if units: row.update(units=units,absolute_tolerance=tolerance)
        checks.append(row)
    def scene_solids(stem, offset=0, exploded=False):
        path=ROOT/'STEP'/f'{stem}.step'
        scene=read_scene(path)
        leaves=list(scene.leaves())
        labels=[leaf.label for leaf in leaves]
        check(stem+'.leaf_labels',sorted(labels),sorted(EXPECTED_BOXES),sorted(labels)==sorted(EXPECTED_BOXES))
        bodies={}
        for leaf in leaves:
            solids=list(leaf.shape().solids())
            check(stem+'.'+leaf.label+'.solid_count',len(solids),1)
            if len(solids)!=1: raise ValueError('Unexpected solid count')
            solid=solids[0]
            bodies[leaf.label]=solid
            check(stem+'.'+leaf.label+'.valid',bool(solid.is_valid),True,bool(solid.is_valid))
            check(stem+'.'+leaf.label+'.positive_volume',float(solid.volume),'> 0',solid.volume>0,'mm^3')
            if not exploded:
                bb=solid.bounding_box()
                for side, expected in zip(('min','max'),EXPECTED_BOXES[leaf.label]):
                    for i,axis in enumerate('XYZ'):
                        target=expected[i]+(offset if leaf.label in FOCUS_LABELS and axis=='X' else 0)
                        check(f'{stem}.{leaf.label}.{side}_{axis}',float(getattr(getattr(bb,side),axis)),target,units='mm')
        files.append({'file':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':sha256(path.read_bytes()).hexdigest(),'leaf_count':len(leaves)})
        return bodies
    def circle_radius(bodies,label,x,radius):
        circles=[e for e in bodies[label].edges().filter_by(bd.GeomType.CIRCLE)
                 if abs(e.arc_center.X-x)<TOL and abs(e.arc_center.Y)<TOL
                 and abs(e.arc_center.Z-355)<TOL and abs(e.length-2*pi*e.radius)<TOL]
        candidates=[e.radius for e in circles if abs(e.radius-radius)<TOL]
        check(f'{label}.circle_at_{x}_radius_{radius}',candidates,[radius],bool(candidates))
        if not candidates: raise ValueError('Required circular edge missing')
        return float(candidates[0])
    def interference(bodies, name):
        maximum=0.0
        for (a,sa),(b,sb) in combinations(bodies.items(),2):
            volume=float(overlap_volume(sa,sb))
            maximum=max(maximum,volume)
            check(f'{name}.overlap.{a}/{b}',volume,0,units='mm^3',tolerance=VOLUME_TOL)
        return maximum
    try:
        home=scene_solids('telescope_assembly')
        extended=scene_solids('telescope_extended',20)
        scene_solids('telescope_exploded',exploded=True)
        tube=home['telescope_tube']
        check('tube.analytic_volume',float(tube.volume),pi*(43**2-40**2)*420,units='mm^3',tolerance=VOLUME_TOL)
        for x in (0,420):
            circle_radius(home,'telescope_tube',x,40)
            circle_radius(home,'telescope_tube',x,43)
        bore=circle_radius(home,'telescope_focuser',446,21)
        outside=circle_radius(home,'focus_drawtube',494,20.75)
        check('focus.radial_clearance',bore-outside,.25,units='mm')
        for name,bodies in [('home',home),('extended',extended)]:
            gap=closest_points(bodies['telescope_focuser'],bodies['focus_drawtube']).distance
            check(name+'.focus_minimum_gap',float(gap),.25,units='mm')
            interference(bodies,name)
        check('extended.engagement',446-extended['focus_drawtube'].bounding_box().min.X,12,units='mm')
        for name in FOCUS_LABELS:
            check(name+'.measured_extension',extended[name].bounding_box().min.X-home[name].bounding_box().min.X,20,units='mm')
        sidecar=json.loads((ROOT/'STEP/telescope_assembly.step.json').read_text(encoding='utf8'))
        saved_hash=sha256((ROOT/'STEP/telescope_assembly.step').read_bytes()).hexdigest()
        check('sidecar.document_hash',sidecar['documentHash'],saved_hash,sidecar['documentHash']==saved_hash)
        motions={m['name']:m for m in sidecar['kinematics']['mates']}
        for name,kind,limits in [('azimuth','revolute',[-135,135]),('altitude','revolute',[0,60]),('focus','slider',[0,20])]:
            mate=motions[name]
            check('motion.'+name+'.kind',mate['kind'],kind,mate['kind']==kind)
            check('motion.'+name+'.limits',mate['limits']['value'],limits,mate['limits']['value']==limits)
            check('motion.'+name+'.resolved_targets',bool(mate['parentId'] and mate['childId']),True,bool(mate['parentId'] and mate['childId']))
        # Independent transforms of saved solids: sampled poses, not a continuous sweep proof.
        sampled=[]
        for altitude,azimuth,focus in [(25,35,10),(60,-135,20),(60,135,0)]:
            posed={}
            for label,body in home.items():
                solid=body
                if label in FOCUS_LABELS: solid=solid.moved(bd.Location((focus,0,0)))
                if label not in {'pedestal','mount_yoke'}: solid=solid.rotate(bd.Axis((210,0,300),(0,1,0)),altitude)
                if label!='pedestal': solid=solid.rotate(bd.Axis((210,0,225),(0,0,1)),azimuth)
                posed[label]=solid
            name=f'pose_alt{altitude}_az{azimuth}_focus{focus}'
            maximum=interference(posed,name)
            minimum_z=min(body.bounding_box().min.Z for body in posed.values())
            check(name+'.above_floor',float(minimum_z),'>= 0',minimum_z>=-TOL,'mm')
            sampled.append({'altitude':altitude,'azimuth':azimuth,'focus':focus,'maximum_overlap_mm3':maximum,'minimum_z_mm':float(minimum_z)})
        error=None
    except Exception as exc:
        error={'type':type(exc).__name__,'message':str(exc)}
        sampled=[]
    failed=sum(c['status']=='fail' for c in checks)
    status='pass' if checks and not failed and not error else 'fail'
    report={'created_at':datetime.now(timezone.utc).isoformat(),'status':status,'checks_passed':len(checks)-failed,'checks_failed':failed,'error':error,'artifacts':files,
            'summary':{'leaf_solids':11,'tube_length_mm':420,'focus_extension_mm':20,'focus_radial_clearance_mm':.25,'extended_engagement_mm':12},
            'sampled_poses':sampled,'checks':checks,'limits':'Geometry and specified sampled poses only. No optical performance, continuous collision sweep, material, load, assembly retention or manufacturing approval.'}
    (ROOT/'notes/telescope-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf8')
    print(json.dumps({k:report[k] for k in ('status','checks_passed','checks_failed','error')},ensure_ascii=False))
    return 0 if status=='pass' else 1

if __name__=='__main__': sys.exit(main())
