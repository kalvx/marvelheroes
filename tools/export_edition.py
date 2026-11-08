"""Export an explicit allowlist of gameplay settings; no player or host data."""
from datetime import datetime, timezone
from pathlib import Path
from hashlib import sha256
import json
import re

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT.parent
SERVER = GAME / '0.8.0' / 'MHServerEmu'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    modes = read_json(SERVER / 'Data' / 'CommandCenterGameManagement.json')
    camera = read_json(GAME / 'CameraLab' / 'applied.json')
    settings = camera['settings']
    # Only individual public economy keys are read from configuration.
    text = '\n'.join(p.read_text(encoding='utf-8-sig') for p in [SERVER / 'Config.ini', SERVER / 'ConfigOverride.ini'] if p.exists())

    def number(key, fallback):
        found = re.findall(r'^\s*' + re.escape(key) + r'\s*=\s*([\d.]+)', text, re.M)
        return float(found[-1]) if found else fallback

    allowed_modes = {k: modes.get(k, 'Existing') for k in ['xp', 'loot', 'rarity', 'special', 'splinters', 'xp_orbs', 'health_orbs', 'boss_difficulty']}
    allowed_camera = {k: settings[k] for k in ['distance', 'zoom_min', 'zoom_max', 'zoom_step', 'field_of_view', 'first_person_fov', 'gamepad_camera']}
    output = {
        'updated': datetime.now(timezone.utc).isoformat(),
        'camera': allowed_camera,
        'modes': allowed_modes,
        'currency': {'splintersToG': number('ESToGazillioniteConversionRatio', 2.25), 'conversionStep': int(number('ESToGazillioniteConversionStep', 4))},
        'guides': {
            'start': {'title': 'Your first hero', 'intro': 'Choose a hero. Make the story your own.', 'blocks': [
                {'title': 'One free permanent hero', 'text': 'Use Choose Free Hero, then Confirm Free Hero on an eligible hero. This choice does not spend Eternity Splinters.'},
                {'title': 'Try before you choose', 'text': 'Available trial heroes can reach level 10. Permanently unlock a hero to continue beyond the trial cap.'},
                {'title': 'Earn the rest', 'text': 'Collect Eternity Splinters as you play, then use the roster or shop to unlock more heroes. The catalog lists reference unlock costs.'},
                {'title': 'Bring a Team-Up', 'text': 'Select an owned companion in Team-Up Heroes with Set Active. Active marks the selected companion. Press K to summon your Team-Up.'},
            ]},
            'camera': {'title': 'Camera & controls', 'intro': 'Get closer to the action.', 'blocks': [
                {'title': 'Three ways to see the world', 'text': 'Press V or F6 to cycle third person, overhead and first person. Third person is selected when a level loads.'},
                {'title': 'Smooth follow-camera zoom', 'text': 'Scroll up to move closer and down to pull back. The third-person camera remembers its zoom when you change views.'},
                {'title': 'Controller camera', 'text': 'With controller input active, use the right stick to orbit in third-person and first-person views. The camera holds its angle when the stick returns to center.'},
                {'title': 'Achievements shortcut', 'text': 'Press Shift + V to open Achievements.'},
            ]},
        },
    }
    target = ROOT / 'dist' / 'edition.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Exported camera, gameplay presets and currency conversion. No account or connection files exported.')


if __name__ == '__main__':
    main()
