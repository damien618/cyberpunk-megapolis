"""Fetch seven verified public-domain Matisse reproductions, served locally.

Run .venv/bin/python tools/download_resort_matisse.py. Requires Pillow.
Museum and Commons notices are retained; no cropping or colour corrections.
"""
import io
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from PIL import Image

DEST = Path(__file__).resolve().parents[1] / 'textures/resort-matisse'
PDM = 'https://creativecommons.org/publicdomain/mark/1.0/'
WORKS = [
    ('fenetre-ouverte', 'Fenêtre ouverte, Collioure', '1905', 'National Gallery of Art, Washington', 46,
     'Matisse-Open-Window.jpg', 'https://www.nga.gov/artworks/106384-open-window-collioure', None),
    ('pommes', 'Les Pommes', '1916', 'Art Institute of Chicago', 89.5,
     'Les Pommes, par Henri Matisse.jpg', 'https://www.artic.edu/artworks/64001', 64001),
    ('femme-aquarium', 'Femme devant un aquarium', '1921–1923', 'Art Institute of Chicago', 100.2,
     'Femme devant un aquarium, par Henri Matisse.jpg', 'https://www.artic.edu/artworks/27984', 27984),
    ('femme-divan-rose', 'Femme au divan rose', '1921', 'Art Institute of Chicago', 46,
     'Femme au divan rose, par Henri Matisse.jpg', 'https://www.artic.edu/artworks/27980', 27980),
    ('atelier-rouge', 'L’Atelier rouge', '1911', 'Museum of Modern Art, New York', 219.1,
     "L'Atelier rouge, par Henri Matisse.jpg", 'https://www.moma.org/collection/works/78389', None),
    ('poissons-palette', 'Poisson rouge et palette', '1914', 'Museum of Modern Art, New York', 112.3,
     'Henri Matisse - Goldfish and Palette (1914).jpg', 'https://www.moma.org/collection/works/79866', None),
    ('danse', 'La Danse II', '1910', 'Musée de l’Ermitage, Saint-Pétersbourg', 391,
     'La Danse II, par Henri Matisse.jpg', None, None),
]


def read(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'ResortMatisseGallery/1.0'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code not in (429, 503) or attempt == 3:
                raise
            time.sleep(15 * (attempt + 1))


def download(spec):
    key, title, date, museum, physical_width, filename, source, aic_id = spec
    notice_path = DEST / f'{key}-metadata.json'
    if notice_path.exists() and (DEST / f'{key}.jpg').exists():
        return json.loads(notice_path.read_text())['work']
    query = urllib.parse.urlencode({'action': 'query', 'format': 'json',
        'titles': 'File:' + filename, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|sha1'})
    notice = json.loads(read('https://commons.wikimedia.org/w/api.php?' + query))
    page = next(iter(notice['query']['pages'].values()))
    info = page['imageinfo'][0]
    metadata = info['extmetadata']
    assert metadata['LicenseShortName']['value'] == 'Public domain', title
    assert 'Matisse' in metadata.get('Artist', {}).get('value', '') or 'Matisse' in filename, title
    commons = info['descriptionurl']
    museum_notice = None
    if aic_id:
        museum_notice = json.loads(read(f'https://api.artic.edu/api/v1/artworks/{aic_id}'))
        assert museum_notice['data']['is_public_domain'], title
        credit = museum_notice['data']['credit_line']
    else:
        credit = f'Henri Matisse — {museum}; reproduction : Wikimedia Commons'
    image_url = info['url'].split('?')[0]
    original = Image.open(io.BytesIO(read(image_url)))
    original.load()
    profile = original.info.get('icc_profile')
    resized = original.convert('RGB')
    resized.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
    options = {'quality': 93, 'optimize': True}
    if profile:
        options['icc_profile'] = profile
    resized.save(DEST / f'{key}.jpg', **options)
    width, height = resized.size
    work = {'id': key, 'artist': 'Henri Matisse', 'file': f'{key}.jpg', 'title': title,
        'date': date, 'museum': museum, 'width': width, 'height': height,
        'source': source or commons, 'image': image_url, 'reproductionSource': commons,
        'license': 'Public domain', 'licenseUrl': PDM, 'credit': credit,
        'physicalWidthCm': physical_width,
        'displayWidth': round(min(physical_width * .014, 1.8, 1.45 * width / height), 4)}
    notice_path.write_text(json.dumps({'downloadedAt': datetime.now(ZoneInfo('Europe/Paris')).isoformat(),
        'commons': notice, 'museum': museum_notice, 'work': work}, ensure_ascii=False, indent=2) + '\n')
    print(key, resized.size, flush=True)
    return work


if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    works = [download(spec) for spec in WORKS]
    (DEST / 'works.json').write_text(json.dumps(works, ensure_ascii=False, indent=2) + '\n')
    rows = ['# Galerie Henri Matisse — sources et crédits', '',
        'Sept reproductions du domaine public, vérifiées dans les notices Wikimedia Commons.',
        'Les notices complètes et dates de téléchargement sont conservées dans `*-metadata.json`.',
        'Le statut du domaine public est également vérifié dans l’API officielle pour les trois œuvres de Chicago.', '',
        'Les fichiers Commons sont des reproductions identifiées sous Public Domain Mark / PD-Art,',
        'et ne sont pas présentés comme des fichiers CC0. Les notices indiquent les sources originales.',
        'Ces tableaux datent de 1905 à 1923. La notice de chaque reproduction précise son statut.', '',
        'Transformation locale : conversion JPEG qualité 93, réduction à 2 048 pixels maximum,',
        'sans agrandissement, recadrage ni correction des couleurs ; conservation du profil ICC disponible.',
        'Aucun appel réseau externe pendant la visite.', '',
        '| Fichier | Œuvre / source | Musée / crédit | Reproduction et statut |',
        '| --- | --- | --- | --- |']
    rows += [f"| {w['file']} | [{w['title']}]({w['source']}), {w['date']} | {w['credit']} | [Notice]({w['reproductionSource']}) · [Domaine public]({PDM}) |" for w in works]
    rows += ['', 'Les titres français et les textes de présentation sont rédigés pour la galerie.', '']
    (DEST / 'CREDITS.md').write_text('\n'.join(rows))
