from pathlib import Path
import json,shutil,hashlib,urllib.request
from PIL import Image
root=Path(r'F:/codex_project/1002_codex_project/projects/011-solaris');a=root/'assets/tryon-research-samples';w=root/'web/tryon/samples';w.mkdir(parents=True,exist_ok=True)
record=json.loads((a/'download-record.json').read_text());src={Path(f['file']).name:f for f in record['files']};annotation=json.loads((a/'vitonhd-target-annotations.json').read_text());tags={v['file_name'][:5]:v for v in annotation['targets'].values()};assert set(tags)=={'00055','14627'}
original_files=['person-00055.jpg','garment-00055.jpg','person-14627.jpg','garment-14627.jpg']
for n in original_files:
 b=(a/'original'/n).read_bytes();assert hashlib.sha256(b).hexdigest()==src[n]['sha256'];(w/n).write_bytes(b)
(w/'viton-hd-CC-BY-NC-4.0.txt').write_bytes((a/'viton-hd-license.txt').read_bytes())
license={'id':'CC-BY-NC-4.0','label':'VITON-HD 研究样本 · 署名 / 非商业 4.0','url':'https://creativecommons.org/licenses/by-nc/4.0/','sourceUrl':'https://github.com/shadow2496/VITON-HD#license','copy':'viton-hd-CC-BY-NC-4.0.txt','commercialUse':False,'attribution':'Seunghwan Choi, Sunghyun Park, Minsoo Lee, Jaegul Choo. VITON-HD: High-Resolution Virtual Try-On via Misalignment-Aware Normalization. CVPR 2021. Official repository LICENSE: Copyright (c) 2021, NeStyle Inc.','changes':'Original JPEG pixels / bytes unchanged. Renamed files only; source README, license, stable retrieval URLs and hashes archived.'}
samples=[];pairs=[]
for id,name,detail in [('00055','紫色撞色字样短袖','撞色领袖、胸前字样、斜肩、腰部塞入与褶皱'),('14627','黑色搭扣交叉短上衣','V 形领口、细肩带 / 搭扣、短下摆和露肤边界')]:
 for kind in ['person','garment']:
  file=kind+'-'+id+'.jpg';source=src[file]
  common={'id':kind+'-'+id,'kind':kind,'name':('原模特 · 'if kind=='person'else '')+name,'image':file,'photoType':'model'if kind=='person'else 'catalog-product','provenance':'VITON-HD 原电商目录研究照片；下载自后续论文官方仓库的输入示例目录。同编号 image / cloth 与 IDM-VTON 官方 VITON-HD 标注、尺寸和衣款视觉匹配；不是生成输出。','sourceDataset':'VITON-HD','datasetFileName':id+'_00.jpg','sourceUrl':source['sourceUrl'],'license':'CC-BY-NC-4.0','licenseUrl':license['url'],'researchOnly':True,'commercialUse':False,'realPhotoConfirmed':True,'realPhotoConfirmationBasis':'Dataset/catalog photo evidence: VITON-HD paper Sections 3 / 4.1; official VITON-HD-tagged image + cloth entry with same ID; original-input-directory files and visual matching. This does not certify camera RAW, EXIF or separate portrait/trademark rights.','cameraOriginalVerified':False,'realProductSKU':None,'width':768,'height':1024,'byteLength':source['byteLength'],'sha256':source['sha256'],'reviewFocus':detail}
  if kind=='garment':common.update({'referenceImage':'person-'+id+'.jpg','referenceLabel':'原模特穿着此原衣的目录照片；用于衣款与上身观察，不是其他人物换装实拍对照','pairedPersonId':'person-'+id,'crossPersonGroundTruth':False})
  else:common.update({'pairedGarmentId':'garment-'+id,'referenceRole':'original-worn-garment photo, not a generated output'})
  samples.append(common)
 pairs.append({'id':'vitonhd-'+id,'personId':'person-'+id,'garmentId':'garment-'+id,'type':'original-worn-garment-paired-reference','description':'原模特已穿此衣；可做原衣重建 / 衣款观察对照。没有同一人物穿另一原衣再实际换到目标衣的三元组。','samePersonDifferentOutfitGroundTruth':False,'differentPersonSameGarmentGroundTruth':False})
m={'schema':1,'date':'2026-10-06','notice':'2 组 VITON-HD 原衣成对研究照片，4 张 JPEG。仅非商业研究，保留出处和许可；不是可售 SKU，也不是本产品生成的试穿结果。跨人 / 跨衣换装没有同人同衣实拍 ground truth。','license':license,'samples':samples,'pairs':pairs,'generatedOutputsIncluded':False,'modelsOrWeightsDownloaded':False,'photoTypeExplanation':{'model':'电商模特目录照片','catalog-product':'白底商品衣图；其拍摄方式未核验，不标成 flat-lay'},'researchLimits':['No real SKU, size chart, material measurement, production pattern or authorized customer scan.','No same-person-before/after cross-outfit photograph triplet.','Only two upper-body female catalog pairs; not representative of all body shapes, poses, clothing or occlusion.','No generated FASHN/FIT image or inferred output is treated as a real-photo reference.']}
model_input=next(s for s in samples if s['id']=='person-14627').copy()
model_input.pop('pairedGarmentId',None)
model_input.update({'id':'garment-model-14627','kind':'garment','photoType':'model','name':'黑色上衣 · 模特穿着参考','pairedPersonId':'person-14627','referenceImage':'person-14627.jpg','referenceLabel':'另一位原模特穿着黑色上衣的目录参考；不是跨人换装的同人同目标衣实拍 ground truth','crossPersonGroundTruth':False,'referenceRole':'model-worn-target-garment input, reused catalogue photograph','reusedImageFrom':'person-14627','inputRoleNote':'复用同一原目录照片作为商品模特穿着输入；没有新增第五张照片，未编辑原像素或 JPEG 字节。'})
samples.append(model_input)
reuse={'roleId':'garment-model-14627','reusedFromRoleId':'person-14627','image':'person-14627.jpg','sha256':model_input['sha256'],'newPhotograph':False,'pixelsOrBytesEdited':False,'description':'One original photograph is registered in two input roles; this does not add cross-person ground truth.'}
m.update({'inputRoleCount':len(samples),'uniqueOriginalPhotographs':len(original_files),'roleReuse':[reuse]})
m['notice']='2 组 VITON-HD 原衣成对研究照片，4 张原 JPEG、5 个输入角色，其中一张原模特图复用为商品模特穿着输入。仅非商业研究，保留出处和许可；不是可售 SKU，也不是生成结果。跨人 / 跨衣换装没有同人同衣实拍 ground truth。'
(w/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
files=[]
for p in sorted(a.rglob('*')):
 if p.is_file()and p.name!='source-manifest.json':
  b=p.read_bytes();files.append({'repositoryPath':str(p.relative_to(root)).replace('\\','/'),'byteLength':len(b),'sha256':hashlib.sha256(b).hexdigest()})
for p in sorted(w.iterdir()):
 b=p.read_bytes();files.append({'repositoryPath':str(p.relative_to(root)).replace('\\','/'),'byteLength':len(b),'sha256':hashlib.sha256(b).hexdigest()})
(a/'source-manifest.json').write_text(json.dumps({'schema':1,'date':'2026-10-06','use':'non-commercial research only','samplePairs':2,'originalJpegs':4,'originalJpegBytes':sum(src[n]['byteLength']for n in original_files),'inputRoleCount':len(samples),'roleReuse':[reuse],'sourceLicense':license,'metadataExtraction':'Only two relevant records retained from official vitonhd_test_tagged.json; full dataset and weights not downloaded.','files':files},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'pairs':2,'images':4,'inputRoles':len(samples),'jpegBytes':sum(src[n]['byteLength']for n in original_files),'runtimeFiles':len(list(w.iterdir())),'samples':[{k:s[k]for k in ['id','image','byteLength','sha256']}for s in samples]},indent=2))
