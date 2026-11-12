"""Package reviewed website files only, excluding caches and local game data."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    checks = json.loads((ROOT / 'checks' / 'site-checks.json').read_text(encoding='utf-8'))
    if not checks.get('passed'):
        raise RuntimeError('Site checks must pass before packaging.')
    files = sorted(p for p in (ROOT / 'dist').rglob('*') if p.is_file())
    archives = []
    # Website archive extracts directly to index.html, for static hosting.
    target = ROOT / 'MarvelHeroes-Compendium.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in files:
            archive.write(path, path.relative_to(ROOT / 'dist').as_posix())
    archives.append({'name': target.name, 'bytes': target.stat().st_size, 'sha256': sha256(target.read_bytes()).hexdigest(), 'files': len(files)})
    # Repository source archive contains only the explicitly selected website files.
    target = ROOT / 'MarvelHeroes-Compendium-Source.zip'
    selected = files + sorted((ROOT / 'tools').glob('*.py')) + sorted((ROOT / 'tools').glob('*.cjs'))
    selected += [ROOT / 'README.md', ROOT / '.gitignore', ROOT / 'Start-Preview.ps1', ROOT / '.github' / 'workflows' / 'pages.yml']
    selected += sorted((ROOT / 'assets' / 'brand').glob('*.png'))
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in selected:
            archive.write(path, path.relative_to(ROOT).as_posix())
    archives.append({'name': target.name, 'bytes': target.stat().st_size, 'sha256': sha256(target.read_bytes()).hexdigest(), 'files': len(selected)})
    report = {'created': datetime.now(timezone.utc).isoformat(), 'destination': 'kalvx/marvelheroes', 'published': False, 'archives': archives, 'verification': checks}
    (ROOT / 'checks' / 'release.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'published': False, 'archives': archives}, indent=2))


if __name__ == '__main__':
    main()
