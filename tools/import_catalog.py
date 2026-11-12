"""Import public catalog facts, not site markup, accounts, or editorial articles.

Standard library only. Cached requests make a rerun incremental. Output is a
self-contained static catalog; the website never contacts table/tooltip APIs.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from hashlib import sha256
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
import argparse
import json
import re
import shutil
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache'
DIST = ROOT / 'dist'
ORIGIN = 'https://itembase.mhbugle.com'
SECTIONS = [
    ('heroes', 'Heroes', '/heroes/', 'Choose your next hero.'),
    ('items', 'Items', '/items/', 'Equipment, artifacts, costumes and more.'),
    ('teamups', 'Team-Ups', '/team-ups/', 'Find a companion for your adventures.'),
    ('powers', 'Powers', '/powers/', 'Explore hero abilities and power trees.'),
    ('vendors', 'Vendors', '/vendors/', 'Find the right merchant and location.'),
    ('zones', 'Zones', '/zones/', 'Explore the places of Marvel Heroes.'),
    ('missions', 'Missions', '/missions/', 'Story chapters, events and objectives.'),
    ('crafting', 'Crafting', '/items/recipes/', 'Recipes and crafting requirements.'),
    ('achievements', 'Achievements', '/achievements/', 'Track the next challenge.'),
    ('villains', 'Villains', '/villains/', 'Know your adversaries.'),
    ('enemies', 'Enemies', '/mobs/', 'Browse enemy groups and locations.'),
    ('waypoints', 'Waypoints', '/waypoints/', 'Plan your route through the world.'),
    ('rooms', 'Treasure Rooms', '/rooms/', 'Discover hidden encounters.'),
]


class Fragment(HTMLParser):
    def __init__(self, source=''):
        super().__init__(convert_charrefs=True)
        self.text = []
        self.links = []
        self.images = []
        self.anchor = None
        self.feed(str(source))

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag in ('br', 'p', 'li', 'div'):
            self.text.append('\n')
        if tag == 'a' and d.get('href'):
            self.anchor = {'href': d['href'], 'label': '', 'id': d.get('data-id', ''), 'filter': d.get('data-f', '')}
            self.links.append(self.anchor)
        if tag == 'img' and d.get('src'):
            self.images.append(d['src'])
        if 'background-image' in d.get('style', ''):
            m = re.search(r'url\([\"\']?(.*?)[\"\']?\)', d['style'])
            if m:
                self.images.append(m[1])

    def handle_endtag(self, tag):
        if tag == 'a':
            self.anchor = None
        if tag in ('p', 'li', 'div'):
            self.text.append('\n')

    def handle_data(self, value):
        self.text.append(value)
        if self.anchor is not None:
            self.anchor['label'] += value

    def plain(self):
        return '\n'.join(' '.join(s.split()) for s in ''.join(self.text).splitlines() if s.strip())


def request(url, form=None, binary=False):
    CACHE.mkdir(parents=True, exist_ok=True)
    key = sha256((url + json.dumps(form, sort_keys=True)).encode()).hexdigest()
    path = CACHE / key
    if not path.exists():
        data = urllib.parse.urlencode(form, doseq=True).encode() if form is not None else None
        req = urllib.request.Request(url, data=data, headers={'User-Agent': 'MarvelHeroesCompendium/1.0 catalog-import', 'Accept-Language': 'en'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=35) as response:
                    result = response.read()
                path.write_bytes(result)
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
    data = path.read_bytes()
    return data if binary else data.decode('utf-8-sig')


def clean(value):
    value = Fragment(value).plain()
    return re.sub(r'\[/?[a-z_]+\]', '', value).strip()


def import_section(section):
    key, title, route, intro = section
    page = request(ORIGIN + route)
    table = re.search(r'<table\b(?=[^>]*id=[\"\']tabsort[\"\'])[^>]*>', page)
    if not table:
        raise ValueError(f'No catalog table at {route}')
    g = re.search(r'data-id=[\"\'](.*?)[\"\']', table[0])[1]
    header = re.search(r'<thead>(.*?)</thead>', page[table.start():], re.S)[1]
    headers = [clean(s) for s in re.findall(r'<th\b[^>]*>(.*?)</th>', header, re.S)]
    payload = json.loads(request(f'{ORIGIN}/getitems.php?g={g}&f='))
    rows = payload.get('data', [])
    records = []
    for i, row in enumerate(rows):
        if not isinstance(row, list) or len(row) < 2:
            continue
        fragments = [Fragment(cell) for cell in row]
        values = [f.plain() for f in fragments]
        name = values[1].strip()
        if not name:
            continue
        primary = next((a for a in fragments[1].links if a['label'].strip()), {})
        images = [im for f in fragments[:2] for im in f.images if im.startswith('/img/')]
        fields = []
        for j in range(2, min(len(headers), len(row))):
            label = headers[j]
            value = values[j].strip()
            if label and value and label.lower() not in ('last update', 'updated', 'id', 'proto', 'prototype'):
                fields.append({'label': label, 'value': value})
        links = []
        for f in fragments[2:]:
            for link in f.links:
                if link['label'].strip() and link['href'].startswith('/'):
                    links.append({'label': link['label'].strip(), 'href': link['href']})
        records.append({
            'id': primary.get('id') or f'{key}-{i}',
            'name': name, 'path': primary.get('href', ''),
            'tooltipId': primary.get('id', ''), 'tooltipFilter': primary.get('filter', ''),
            'icon': images[0] if images else '',
            'art': next((im for im in images if '/costumes/' in im), ''),
            'fields': fields, 'links': links,
        })
    print(f'{key}: {len(records)} records', flush=True)
    return {'id': key, 'title': title, 'intro': intro, 'source': ORIGIN + route, 'records': records}


def import_tooltips(catalog):
    pairs = {(r['tooltipId'], r['tooltipFilter']) for s in catalog for r in s['records'] if r['tooltipId'].isdigit()}
    results = {}
    batches = [sorted(pairs)[i:i+48] for i in range(0, len(pairs), 48)]
    # Small batches match the site's normal table tooltip requests.
    for index, batch in enumerate(batches):
        form = {'id[]': [p[0] for p in batch], 'f[]': [p[1] for p in batch]}
        data = json.loads(request(ORIGIN + '/itemjson.php', form))
        for entry in data if isinstance(data, list) else data.values():
            if not isinstance(entry, dict) or not isinstance(entry.get('Item'), dict):
                continue
            item = entry['Item']
            item_id = str(item.get('id', entry.get('id', '')))
            if not item_id:
                continue
            # No biography, flavor text, comments, author/account metadata.
            facts = {}
            for field in ('name', 'type_name', 'level', 'grade', 'slot', 'tradeable', 'price', 'info', 'info_curent', 'power', 'cosmic', 'bonus', 'ench', 'visual'):
                if item.get(field) not in (None, '', False):
                    facts[field] = clean(str(item[field]))
            facts['icon'] = item.get('icon', '')
            if isinstance(item.get('vals'), dict):
                facts['ranks'] = item['vals']
            results[item_id + '|' + str(entry.get('f', ''))] = facts
        if index % 10 == 0:
            print(f'Item facts: batch {index+1}/{len(batches)}', flush=True)
        time.sleep(0.12)
    print(f'Item facts: {len(results)}', flush=True)
    (CACHE / 'tooltip-facts.json').write_text(json.dumps(results, ensure_ascii=False), encoding='utf-8')
    return results


def mirror_images(catalog, details):
    paths = set()
    for section in catalog:
        for r in section['records']:
            paths.update(p for p in (r['icon'], r['art']) if p.startswith('/img/'))
    paths.update(d['icon'] for d in details.values() if d.get('icon', '').startswith('/img/'))
    manifest = {}
    failed = []

    def download(path):
        dest = DIST / 'assets' / 'catalog' / path.removeprefix('/img/')
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            data = request(ORIGIN + urllib.parse.quote(path, safe='/'), binary=True)
            if not (data.startswith(b'\x89PNG') or data.startswith(b'\xff\xd8') or data.startswith(b'GIF8') or data.startswith(b'RIFF')):
                raise ValueError('Response is not an image')
            dest.write_bytes(data)
        return path, dest.relative_to(DIST).as_posix()

    with ThreadPoolExecutor(max_workers=4) as pool:
        tasks = {pool.submit(download, path): path for path in sorted(paths)}
        for i, task in enumerate(as_completed(tasks)):
            try:
                source, dest = task.result()
                manifest[source] = dest
            except Exception as error:
                failed.append({'path': tasks[task], 'error': str(error)})
            if i % 300 == 0:
                print(f'Artwork: {i+1}/{len(paths)}', flush=True)
    for section in catalog:
        for r in section['records']:
            r['icon'] = manifest.get(r['icon'], '')
            r['art'] = manifest.get(r['art'], '')
    for item in details.values():
        item['icon'] = manifest.get(item.get('icon'), '')
    (CACHE / 'artwork-report.json').write_text(json.dumps({'downloaded': len(manifest), 'missing': failed}, indent=2), encoding='utf-8')
    print(f'Artwork: {len(manifest)} local images, {len(failed)} unavailable', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--skip-artwork', action='store_true')
    args = parser.parse_args()
    DIST.mkdir(parents=True, exist_ok=True)
    catalog = []
    for section in SECTIONS:
        catalog.append(import_section(section))
    details = import_tooltips(catalog)
    if not args.skip_artwork:
        mirror_images(catalog, details)
    data = {'updated': datetime.now(timezone.utc).isoformat(), 'sections': catalog, 'details': details}
    (DIST / 'catalog.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (CACHE / 'import-report.json').write_text(json.dumps({'sections': {s['id']: len(s['records']) for s in catalog}, 'details': len(details)}, indent=2), encoding='utf-8')
    assets = DIST / 'assets'
    assets.mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'assets' / 'brand' / 'cosmic-crisis-logo.png', assets / 'cosmic-crisis-logo.png')
    print('Catalog export complete.', flush=True)


if __name__ == '__main__':
    main()
