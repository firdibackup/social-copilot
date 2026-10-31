"""Source contract only (no browser/build): python3 scripts/check-product-tour.py."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = '6b9b8cbe736b42cc21f24836ea47ce0dfa9b8548'

def original(path):
    return subprocess.check_output(['git', 'show', f'{BASE}:{path}'], cwd=ROOT, text=True)

def read(path):
    return (ROOT / path).read_text()

tsx_path = 'src/components/landing/homepage-story.tsx'
css_path = 'src/components/landing/homepage-story.module.css'
tsx, css = read(tsx_path), read(css_path)
old_tsx, old_css = original(tsx_path), original(css_path)
# Entire hero, cover registry, album state/event/animation code and mobile CSS.
assert tsx[tsx.index('function Instagram('):tsx.index('function useChapters(')] == old_tsx[old_tsx.index('function Instagram('):old_tsx.index('function useChapters(')]
assert css[css.index('.showcase {'):css.index('@media(min-width: 1500px)')] == old_css[old_css.index('.showcase {'):old_css.index('@media(min-width: 1500px)')]
assert css[:css.index('.journey {')] == old_css[:old_css.index('.journey {')]
for locale in ('id', 'en'):
    path = f'messages/{locale}/landing.json'
    assert read(path) == original(path)
    json.loads(read(path))
assert read('src/components/landing/landing-page.tsx') == original('src/components/landing/landing-page.tsx')
groups = re.findall(r"covers: \[([\d, ]+)\]", tsx)
indices = [[int(n) for n in group.split(',')] for group in groups]
assert len(indices) == 4 and all(len(group) == 5 for group in indices)
assert sorted(sum(indices, [])) == list(range(20))
match = re.search(r'const names = \[(.*?)\]', tsx)
assert match is not None
names = match.group(1)
for name in re.findall(r"'([^']+)'", names):
    assert (ROOT / 'public/covers' / f'{name}.webp').is_file(), name
assert [tsx.index(f"id: '{name}'") for name in ('jadwal', 'asisten', 'desain', 'auto-dm')] == sorted(tsx.index(f"id: '{name}'") for name in ('jadwal', 'asisten', 'desain', 'auto-dm'))
for token in ('height: 440vh', 'position: sticky', 'height: 100svh', "max-width: 900px", "data-motion='false'", 'repeat(4, minmax(0, 1fr))'):
    assert token in css, token
for start, speed in (('.01', 9), ('.26', 10), ('.51', 10), ('.76', 9)):
    assert f'(var(--sp) - {start}) * {speed}' in css
for end in ('.21', '.46', '.71'):
    assert f'(var(--sp) - {end}) * 12' in css
assert "offset: ['start start', 'end end']" in tsx
assert 'value < .25 ? 0 : value < .5 ? 1 : value < .75 ? 2 : 3' in tsx
assert 'inert={motionEnabled && active !== index}' in tsx
assert 'preventScroll: true' in tsx
assert 'Math.max(1, root.offsetHeight - window.innerHeight)' in tsx
# Threshold/landing arithmetic, including backwards motion and clamping.
def step(p):
    return 0 if p < .25 else 1 if p < .5 else 2 if p < .75 else 3
assert [step(p) for p in (0, .2499, .25, .4999, .5, .7499, .75, 1)] == [0, 0, 1, 1, 2, 2, 3, 3]
for index in range(4):
    p = index * .25 + .14
    assert step(p) == index
    start, speed = ((.01, 9), (.26, 10), (.51, 10), (.76, 9))[index]
    assert min(1, max(0, (p - start) * speed)) == 1
assert css.count('{') == css.count('}')
assert not re.search(r'\b(fetch|XMLHttpRequest|WebSocket)\s*\(', tsx)
print('PASS: preserved hero/rest/4x5 album/locales; tour timing, static fallback, focus isolation, assets and simulation-only contracts')
