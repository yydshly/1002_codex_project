"""Resume public runtime files from their original vendor URLs; verify vendor SHA256.

No inference API, personal images, mirror server or authentication token is used.
Requires requests; files stay in the project's ignored .runtime directory.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import html
import json
from pathlib import Path
import re
import time
import threading
from urllib.parse import unquote, urlsplit
import requests

ROOT = Path(__file__).resolve().parents[1] / '.runtime' / 'tryon'
CHUNK = 32 * 1024 * 1024
SESSIONS = threading.local()

def source(component):
    if component in ('torch', 'vision'):
        package, version = ('torch', '2.8.0') if component == 'torch' else ('torchvision', '0.23.0')
        name = f'{package}-{version}+cu128-cp310-cp310-win_amd64.whl'
        page = requests.get(f'https://download.pytorch.org/whl/cu128/{package}/', timeout=30)
        page.raise_for_status()
        links = [html.unescape(x) for x in re.findall(r'href="([^"]+)"', page.text)]
        link = next(x for x in links if unquote(urlsplit(x).path).endswith('/'+name))
        sha = urlsplit(link).fragment.removeprefix('sha256=')
        # Original PyTorch CDN carries the same hash-registered wheel as the index's R2 link.
        return f'https://download.pytorch.org/whl/cu128/{name.replace("+", "%2B")}', ROOT/'downloads'/name, None, sha
    repo, name, folder = {
        'weights': ('fashn-ai/fashn-vton-1.5', 'model.safetensors', ROOT/'weights'),
        'pose-detector': ('fashn-ai/DWPose', 'yolox_l.onnx', ROOT/'weights'/'dwpose'),
        'pose-estimator': ('fashn-ai/DWPose', 'dw-ll_ucoco_384.onnx', ROOT/'weights'/'dwpose'),
    }[component]
    response = requests.get(f'https://huggingface.co/api/models/{repo}?blobs=true', timeout=30)
    response.raise_for_status()
    entry = next(x for x in response.json()['siblings'] if x['rfilename']==name)
    return f'https://huggingface.co/{repo}/resolve/main/{name}?download=true', folder/name, entry['size'], entry['lfs']['sha256']

def digest(file):
    sha=hashlib.sha256()
    with file.open('rb') as handle:
        for block in iter(lambda:handle.read(8*1024*1024),b''):sha.update(block)
    return sha.hexdigest()

def download(component):
    url,target,size,expected=source(component)
    if not re.fullmatch('[a-f0-9]{64}',expected):raise RuntimeError('Vendor SHA256 is missing')
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists() and digest(target)==expected:
        print(json.dumps({'component':component,'status':'already-verified','bytes':target.stat().st_size}),flush=True);return
    with requests.get(url,headers={'Range':'bytes=0-0'},stream=True,timeout=(20,30)) as response:
        response.raise_for_status()
        content_range=response.headers.get('Content-Range','')
        match=re.fullmatch(r'bytes 0-0/(\d+)',content_range)
        if not match:raise RuntimeError('Vendor did not honor range request')
        actual_size=int(match.group(1))
    if size is not None and actual_size!=size:raise RuntimeError('Vendor size metadata mismatch')
    size=actual_size
    parts=ROOT/'downloads'/(target.name+'.parts');parts.mkdir(parents=True,exist_ok=True)
    ranges=[(i,start,min(size-1,start+CHUNK-1)) for i,start in enumerate(range(0,size,CHUNK))]
    def part(item):
        index,start,end=item;file=parts/f'{index:04d}.part';required=end-start+1
        if file.exists() and file.stat().st_size==required:return required
        if not hasattr(SESSIONS,'http'):SESSIONS.http=requests.Session()
        http=SESSIONS.http
        for attempt in range(4):
            try:
                separator='&' if '?' in url else '?'
                with file.open('wb') as handle:
                    for block_start in range(start,end+1,4*1024*1024):
                        block_end=min(end,block_start+4*1024*1024-1)
                        part_url=url if component=='torch' or attempt==0 else url+separator+f'attempt={attempt}&tick={time.time_ns()}'
                        with http.get(part_url,headers={'Range':f'bytes={block_start}-{block_end}'},stream=True,timeout=(15,25)) as response:
                            response.raise_for_status()
                            if response.headers.get('Content-Range')!=f'bytes {block_start}-{block_end}/{size}':raise RuntimeError('Unexpected range response')
                            received=0
                            for data in response.iter_content(1024*1024):handle.write(data);received+=len(data)
                            if received!=block_end-block_start+1:raise RuntimeError('Partial subrange body')
                if file.stat().st_size!=required:raise RuntimeError('Partial range body')
                return required
            except Exception as error:
                print(json.dumps({'component':component,'part':index,'retry':attempt+1,'error':str(error)[:180]}),flush=True)
                if attempt==3:raise
                time.sleep(1+attempt)
    completed=0;start_time=time.monotonic()
    print(json.dumps({'component':component,'status':'downloading','bytes':size,'sha256':expected}),flush=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        for future in as_completed([pool.submit(part,r) for r in ranges]):
            completed+=future.result()
            print(json.dumps({'component':component,'receivedMiB':round(completed/1024/1024),'totalMiB':round(size/1024/1024),'elapsedSeconds':round(time.monotonic()-start_time)}),flush=True)
    assembly=target.with_name(target.name+'.assembling')
    with assembly.open('wb') as output:
        for index,_,_ in ranges:
            with (parts/f'{index:04d}.part').open('rb') as handle:
                for data in iter(lambda:handle.read(8*1024*1024),b''):output.write(data)
    if assembly.stat().st_size!=size or digest(assembly)!=expected:raise RuntimeError('Downloaded bytes failed vendor SHA256 verification')
    assembly.replace(target)
    # Only individual helper-created chunk files in the checked runtime directory are removed.
    for index,_,_ in ranges:
        file=(parts/f'{index:04d}.part').resolve()
        if ROOT.resolve() not in file.parents:raise RuntimeError('Unsafe helper chunk path')
        file.unlink()
    evidence={'component':component,'status':'verified','bytes':size,'sha256':expected,'source':url,'elapsedSeconds':round(time.monotonic()-start_time,2)}
    (ROOT/'downloads'/f'{component}-verified.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(evidence),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('component',choices=['torch','vision','weights','pose-detector','pose-estimator']);args=parser.parse_args();download(args.component)
