"""Import factual mission objectives and navigation hints; omit story prose."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import re
from import_catalog import CACHE, ORIGIN, SECTIONS, clean, import_section, request


def read_mission(record):
    page = request(ORIGIN + record['path'])
    result = {'path': record['path'], 'name': record['name'], 'hints': [], 'objectives': []}
    objectives = re.search(r'Mission objectives:</div>\s*(<ul>.*?</ul>)', page, re.S)
    if objectives:
        result['objectives'] = [clean(s) for s in re.findall(r'<li\b[^>]*>(.*?)</li>', objectives[1], re.S)]
    hints = re.search(r'Hints:</div>(.*?)(?:<div class="mtitle">|</table>)', page, re.S)
    if hints:
        result['hints'] = [clean(s) for s in re.findall(r'<p\b[^>]*>(.*?)</p>', hints[1], re.S) if clean(s)]
        if not result['hints']:
            text = clean(hints[1])
            if text:
                result['hints'] = [text]
    result['zones'] = [link['href'] for link in record['links'] if link['href'].startswith('/zone/')]
    return result


def main():
    section = import_section(next(s for s in SECTIONS if s[0] == 'missions'))
    missions = [r for r in section['records'] if any(f['label']=='Type' and ('Chapter' in f['value'] or 'Prologue' in f['value']) for f in r['fields'])]
    # MGH route is immediately available from the already inspected source.
    missions.sort(key=lambda r: 'mission/50/' not in r['path'])
    output = {}
    errors = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        tasks = {pool.submit(read_mission, r): r['path'] for r in missions}
        for i, task in enumerate(as_completed(tasks)):
            try:
                record = task.result()
                output[record['path']] = record
            except Exception as error:
                errors.append({'path': tasks[task], 'error': str(error)})
            (CACHE / 'route-hints.json').write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
            if i % 10 == 0:
                print(f'Mission routes: {i+1}/{len(missions)}', flush=True)
    (CACHE / 'routes-report.json').write_text(json.dumps({'imported': len(output), 'errors': errors}, indent=2), encoding='utf-8')
    print(f'Mission routes complete: {len(output)} records; {len(errors)} unavailable.', flush=True)


if __name__ == '__main__':
    main()
