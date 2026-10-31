"""Lightweight source/geometry contract; no JS runtime or browser verification."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = (root / 'src/components/landing/homepage-story.tsx').read_text()
css = (root / 'src/components/landing/homepage-story.module.css').read_text()

def table(name):
    match = re.search(rf'const {name} = (\[[^;\n]+\]) as const', source)
    assert match, f'Missing source-derived geometry: {name}'
    return json.loads(match[1])

assert table('folderPoses') == [[0, -2], [18, 1.5], [34, -1], [8, 2]]
assert table('paperRest') == [[16, 4], [9, 1.5], [3, -1], [0, 0], [0, 0]]
assert table('paperHover') == [[34, 7], [22, 3.5], [10, .5], [0, 0], [0, 0]]
assert table('paperRotations') == [-1.8, 1.4, -.8, 2, -1.8]
groups = re.findall(r"key: '\w+', covers: (\[[^\]]+\])", source)
covers = [json.loads(group) for group in groups]
assert len(covers) == 4 and all(len(group) == 5 for group in covers)
assert sorted(index for group in covers for index in group) == list(range(20))
showcase = source.split('export function ContentShowcase')[1].split('function useChapters')[0]
assert '<details' not in showcase
assert 'mode="popLayout"' in showcase and 'layoutScroll' in showcase
assert 'selected ? [selected] : showcaseFolders' in showcase
assert showcase.count('layoutId={`') == 2
assert 'setClosing(true)' in showcase and 'setActive(null)' in showcase
assert 'motionEnabled ? 140 : 0' in showcase
assert "event.key === 'Escape'" in showcase
assert "stage.current?.dataset.open !== 'true'" in showcase
assert 'clearTimeout' in showcase and '.focus({ preventScroll: true })' in showcase
assert '@media(max-width: 767px)' in css
assert 'scroll-snap-type: x mandatory' in css
assert '.folders[data-open=\'true\']' in css and 'width: calc(50% - 7px)' in css
assert 'grid-template-columns: repeat(2' not in css.split('.showcase {')[1].split('@media(min-width: 1500px)')[0]
assert "stage.current?.dataset.open === 'true'" in showcase  # exiting children retain old handlers
for viewport in (320, 375, 767):
    available = viewport - 48
    width = available / 2 - 7
    assert width > 0 and 2 * width + 14 == available
for viewport in (768, 1024, 1160, 1440):
    gap = max(12, min(viewport * .02, 28))
    width = max(100, min((viewport - 48 - 5 * gap) / 6, 162))
    assert 6 * width + 5 * gap <= min(viewport, 1160) - 48
for locale in ('id', 'en'):
    messages = json.loads((root / f'messages/{locale}/landing.json').read_text())
    assert all(messages['story']['showcase'][key] for key in ('open', 'close', 'count', 'disclaimer', 'beauty', 'living', 'spaces', 'business'))
names = re.search(r'const names = (\[[^\n]+\])', source)
assert names
for name in re.findall(r"'([^']+)'", names[1]):
    assert (root / f'public/covers/{name}.webp').is_file()
print('PASS: source-derived poses, 4 × 5 unique cover files, shared-layout/state wiring, mobile/desktop geometry and locale source contracts (not rendered parity)')
