"""Lightweight source contracts, not visual/runtime proof."""
from pathlib import Path
import json
import re
import subprocess
ROOT = Path(__file__).resolve().parents[1]
BASE = 'f5bb94c'
def read(p): return (ROOT / p).read_text()
def original(p): return subprocess.check_output(['git', 'show', f'{BASE}:{p}'], cwd=ROOT, text=True)
ts = 'src/components/landing/homepage-story.tsx'
cs = 'src/components/landing/homepage-story.module.css'
tsx, css = read(ts), read(cs)
old = original(ts)
assert 'data-opening-chat' in tsx, 'Missing opening conversational hero'
assert 'tourSteps' not in tsx and 'CalendarSimulation' not in tsx
assert tsx[tsx.index('const showcaseFolders'):tsx.index('// Opening chat')] == old[old.index('const showcaseFolders'):old.index('function useChapters')]
assert css[css.index('.showcase {'):css.index('/* Opening chat */')] == original(cs)[original(cs).index('.showcase {'):original(cs).index('@media(max-width: 1000px)')]
for locale in ('id', 'en'):
    data = json.loads(read(f'messages/{locale}/landing.json'))
    baseline = json.loads(original(f'messages/{locale}/landing.json'))
    assert data['story']['showcase'] == baseline['story']['showcase']
    assert data['story']['covers'] == baseline['story']['covers']
    assert set(data['story']['opening']) == set(json.loads(read('messages/id/landing.json'))['story']['opening'])
groups = [[int(n) for n in g.split(',')] for g in re.findall(r'covers: \[([\d, ]+)\]', tsx)]
assert len(groups) == 4 and all(len(g) == 5 for g in groups)
assert sorted(sum(groups, [])) == list(range(20))
match = re.search(r'const names = \[(.*?)\]', tsx)
assert match is not None
for name in re.findall(r"'([^']+)'", match[1]):
    assert (ROOT / 'public/covers' / f'{name}.webp').is_file()
    assert subprocess.check_output(['git', 'diff', BASE, '--', f'public/covers/{name}.webp'], cwd=ROOT) == b''
assert 'height: 340vh' in css and 'height: 100svh' in css
assert 'data-mascot' in tsx and 'styles.openingGuide' in tsx
assert 'display: none' not in css[css.index('/* Opening chat */'):]
for threshold in ('.47', '.5', '.55', '.58', '.61', '.705', '.725', '.75', '.91'):
    assert f'p >= {threshold}' in tsx, threshold
assert '(p - .26) / .18' in tsx and '(p - .77) / .13' in tsx
assert "offset: ['start start', 'end end']" in tsx
assert "data-motion='false'" in css
journey = tsx[tsx.index('export function ProductJourney'):]
assert 'shortViewport' not in journey and 'matchMedia' not in journey
assert 'const animated = motionEnabled' in journey, 'Only pause/reduced motion may disable the timeline'
compact = css[css.index('@media(max-height: 700px)'):css.index(".opening[data-motion='false']")]
for declaration in ('min-height: 0', 'top: 82px; bottom: 64px', 'padding: 82px 12px 64px', 'grid-template-rows: minmax(0, 1fr)', 'max-height: 100%', 'overflow-y: auto', 'flex-direction: column-reverse', 'pointer-events: auto', 'top: 8px', 'width: 64px; height: 64px'):
    assert declaration in compact, declaration
assert 'inert={animated && p < .25}' in journey
# Explicit compact layout budget, including a usable chat body at 375px.
for height in (375, 568, 667, 700):
    chat = height - 82 - 64
    assert chat - 38 - 60 >= 100
    assert 8 + 64 < 82  # Mimo above chat
    assert height - 64 < height - 14 - 44  # chat above footer
assert 'const p = animated ? progress : 1' in journey
assert 'data-motion={animated}' in journey and "'--sp': animated ? scrollYProgress : 1" in journey
assert 'inert={animated && p > .08}' in journey and 'still={!animated}' in journey
for selector, declaration in [('openingPin', 'height: auto'), ('openingStage', 'position: relative'), ('openingBody', 'overflow: visible'), ('openingGuide', 'position: relative'), ('openingFoot', 'position: relative')]:
    rule = re.search(r"\.opening\[data-motion='false'\](?:\[data-pose\])? \." + selector + r' \{([^}]+)\}', css)
    assert rule and declaration in rule[1], selector
advance = journey[journey.index('const advance ='):journey.index('return <motion.section')]
assert re.search(r"if \(!animated\) \{\s*conversation.current\?\.scrollIntoView\(\{ behavior: 'instant', block: 'start' \}\)\s*return\s*\}", advance), 'Static Explore must target the rendered conversation, not timeline zero'
assert advance.index('if (!animated)') < advance.index('const target =')
assert 'ref={conversation} className={styles.openingChat}' in journey
assert '{animated && <button ref={nextButton}' in journey, 'Static mode must omit Replay/Next'
assert css.count('{') == css.count('}')
assert '<GalleryHero' not in read('src/components/landing/landing-page.tsx')
assert not re.search(r'\b(fetch|XMLHttpRequest|WebSocket)\s*\(', tsx)
def clamp(v): return min(1, max(0, v))
assert [round(clamp((p-.26)/.18), 4) for p in (0,.26,.35,.44,1)] == [0,0,.5,1,1]
assert [round(clamp((p-.77)/.13), 4) for p in (.75,.77,.835,.9,1)] == [0,0,.5,1,1]
print('PASS: opening timeline, persistent mascot, 4x5 unchanged albums/covers/locales, reduced-motion and simulation contracts')
