"""Narrow orbit/showcase source and asset contracts; NOT runtime/visual proof.

The historical filename is retained for existing callers. Browser QA owns motion,
clearance, upright cards, clipping and responsive behavior.
"""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


showcase = read('src/components/landing/homepage-story.tsx')
hero = read('src/components/landing/orbit-hero.tsx')
landing = read('src/components/landing/landing-page.tsx')
css = read('src/components/landing/orbit-hero.module.css')

for hook in ('hero', 'stage', 'camera', 'ring', 'card', 'copy', 'toggle'):
    assert f'data-orbit-{hook}' in hero, f'Missing orbit {hook} hook'
assert 'data-paused' in hero, 'Expose effective motion state for runtime QA'
assert re.search(r'id=[\'"]fitur[\'"]', hero)
assert re.search(r'href=[\'"]/daftar[\'"]', hero)
assert re.search(r'href=[\'"]#konten[\'"]', hero)
assert '<h1' not in hero, 'OnboardingHero owns the page h1'
assert len(re.findall(r'<h2 id="hero-title"', hero)) == 1
for obsolete in ('data-opening-chat', 'data-mascot', 'ProductJourney'):
    assert obsolete not in hero + showcase + landing, f'Obsolete opening: {obsolete}'
assert not re.search(r'\b(fetch|XMLHttpRequest|WebSocket)\s*\(', hero)
assert css.count('{') == css.count('}'), 'Unbalanced hero CSS braces'

# Validate the established four-by-five grouping, without git-baseline slices or
# assumptions about whitespace, comments, motion formulas or CSS implementation.
groups = re.findall(r'covers:\s*\[([\d,\s]+)\]', showcase)
groups = [[int(n) for n in re.findall(r'\d+', group)] for group in groups]
assert len(groups) == 4 and all(len(group) == 5 for group in groups)
assert sorted(sum(groups, [])) == list(range(20))
assert re.search(r'id=[\'"]konten[\'"]', showcase)
assert 'data-folder' in showcase and 'aria-expanded' in showcase
assert 'showcase-disclaimer' in showcase
names_match = re.search(r'const names\s*=\s*\[([\s\S]*?)\]', showcase)
assert names_match, 'Missing showcase cover manifest'
names = re.findall(r'[\'"]([^\'"]+)[\'"]', names_match[1])
assert len(names) == len(set(names)) == 20
assert [int(name[:2]) for name in names] == list(range(1, 21))
for name in names:
    asset = ROOT / 'public/covers' / f'{name}.webp'
    assert asset.is_file() and asset.stat().st_size > 0, f'Missing cover {asset}'
    header = asset.read_bytes()[:12]
    assert header[:4] == b'RIFF' and header[8:12] == b'WEBP', f'Invalid WebP {asset}'

catalogs = [json.loads(read(f'messages/{locale}/landing.json')) for locale in ('id', 'en')]
for data in catalogs:
    story = data['story']
    for key in ('title1', 'title2', 'body'):
        assert story['opening'][key].strip(), f'Missing opening copy: {key}'
    for key in ('beauty', 'living', 'spaces', 'business', 'disclaimer', 'open', 'close', 'count'):
        assert story['showcase'][key].strip(), f'Missing showcase copy: {key}'
    for index in range(20):
        assert story['covers'][f'label{index}'].strip()
    assert '{category}' in story['covers']['alt']
assert set(catalogs[0]['story']['opening']) == set(catalogs[1]['story']['opening'])
assert set(catalogs[0]['story']['showcase']) == set(catalogs[1]['story']['showcase'])
print('PASS: orbit hooks/routes, retired chat, four-by-five showcase, 20 WebP assets, bilingual copy contracts (not runtime proof)')
