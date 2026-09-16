"""Fetch verified public-domain Monet reproductions; record museum provenance."""
import json
import urllib.request
import urllib.parse
from pathlib import Path
from PIL import Image
import io
import subprocess

ROOT = Path(__file__).resolve().parents[1] / 'textures' / 'cruise-monet'
ROOT.mkdir(parents=True, exist_ok=True)
def get(url):
    return subprocess.check_output(['curl','--fail','-L','-s','--retry','3','--max-time','60',url])
def data(url): return json.loads(get(url))
works = []
def save(key, title, date, museum, source, image, license):
    path = ROOT / (key + '.jpg')
    if not path.exists():
        im = Image.open(io.BytesIO(get(image))).convert('RGB')
        im.thumbnail((2560, 2560))
        im.save(path, quality=92)
    w, h = Image.open(path).size
    works.append(dict(file=key+'.jpg',title=title,date=date,museum=museum,source=source,image=image,license=license,width=w,height=h))
    print(key, w, h, flush=True)
for key, file, date, museum in [
    ('clouds','Claude Monet - Reflections of Clouds on the Water-Lily Pond.jpg','1920–1926','Museum of Modern Art'),
    ('seerosen','Claude Monet - Seerosen.jpg','vers 1915','Bayerische Staatsgemäldesammlungen, Munich'),
    ('monet-044','Claude Monet 044.jpg','après 1916','National Gallery, Londres'),
    ('moma','Monet - Water Lilies, 1914-26, 712.1959.jpg','1914–1926','Museum of Modern Art'),
    ('met','Water Lilies MET DT1856.jpg','1916–1919','The Metropolitan Museum of Art'),
    ('willow','Claude Monet, Water-Lily Pond and Weeping Willow.JPG','1916–1919','Collection particulière'),
    ('honolulu','Claude Monet - Water Lilies, 1917-1919.JPG','1917–1919','Honolulu Museum of Art'),
    ('san-francisco','Monet - Water Lilies, ca. 1914–1917.jpg','vers 1914–1917','Fine Arts Museums of San Francisco'),
]:
    url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',titles='File:'+file,prop='imageinfo',iiprop='url|extmetadata',iiurlwidth=2560))
    a=next(iter(data(url)['query']['pages'].values()))['imageinfo'][0]
    license=a['extmetadata']['LicenseShortName']['value']
    assert 'public domain' in license.lower() or license in ['CC0','CC BY-SA 4.0'], license
    save(key,'Nymphéas',date,museum,a['descriptionurl'],a['url'].split('?')[0],license)
    works[-1]['attribution']=a['extmetadata'].get('Artist',{}).get('value','Claude Monet')
    works[-1]['credit']=a['extmetadata'].get('Credit',{}).get('value','')
    works[-1]['licenseUrl']=a['extmetadata'].get('LicenseUrl',{}).get('value','https://creativecommons.org/publicdomain/mark/1.0/')
    (ROOT / (key+'-metadata.json')).write_text(json.dumps(a['extmetadata'],ensure_ascii=False,indent=2)+'\n')
(ROOT / 'works.json').write_text(json.dumps(works,ensure_ascii=False,indent=2)+'\n')
