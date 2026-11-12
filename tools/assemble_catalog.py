"""Assemble cached catalog facts and locally available artwork for deployment."""
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import re
from import_catalog import CACHE, DIST, ROOT, SECTIONS, import_section, import_tooltips


def canonical(path):
    return path.rstrip('/')


def main():
    raw = CACHE / 'catalog-raw.json'
    if raw.exists():
        data = json.loads(raw.read_text(encoding='utf-8'))
    else:
        sections = [import_section(s) for s in SECTIONS]
        data = {'updated': datetime.now(timezone.utc).isoformat(), 'sections': sections, 'details': import_tooltips(sections)}
        raw.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    routes_path = CACHE / 'route-hints.json'
    routes = json.loads(routes_path.read_text(encoding='utf-8')) if routes_path.exists() else {}
    paths = {canonical(r['path']): r for s in data['sections'] for r in s['records'] if r['path']}
    for route in routes.values():
        mission = paths.get(canonical(route['path']))
        if mission:
            mission.update({k: route[k] for k in ('hints','objectives')})
        for zone_path in route['zones']:
            zone = paths.get(canonical(zone_path))
            if not zone:
                continue
            hints = [h for h in route['hints'] if zone['name'].lower() in h.lower()]
            if hints:
                zone['hints'] = list(dict.fromkeys(zone.get('hints', []) + hints))
            zone.setdefault('relatedMissions', []).append(route['path'])
    missing = set()

    def local_image(source):
        if not source or not source.startswith('/img/'):
            return ''
        dest = Path('assets') / 'catalog' / source.removeprefix('/img/')
        if (DIST / dest).exists():
            return dest.as_posix()
        missing.add(source)
        return ''

    for section in data['sections']:
        for record in section['records']:
            for field in record['fields']:
                if field['label'] == 'Level':
                    field['value'] = re.sub(r'^\d+\s+(?=\d)', '', field['value'])
            record['icon'] = local_image(record['icon'])
            record['art'] = local_image(record['art'])
    for item in data['details'].values():
        item['icon'] = local_image(item.get('icon'))
    DIST.mkdir(parents=True, exist_ok=True)
    (DIST / 'assets').mkdir(exist_ok=True)
    shutil.copy2(ROOT / 'assets' / 'brand' / 'cosmic-crisis-logo.png', DIST / 'assets' / 'cosmic-crisis-logo.png')
    (DIST / 'catalog.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (CACHE / 'assembly-report.json').write_text(json.dumps({'records': sum(len(s['records']) for s in data['sections']), 'detailFacts': len(data['details']), 'missionRoutes': len(routes), 'missingArtwork': sorted(missing)}, indent=2), encoding='utf-8')
    print(f'Assembled {sum(len(s["records"]) for s in data["sections"])} entries, {len(data["details"])} fact sheets, {len(routes)} mission routes; {len(missing)} artwork files pending.')


if __name__ == '__main__':
    main()
