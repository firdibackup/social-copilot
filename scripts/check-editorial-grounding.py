"""Prompt-contract regression, not a model-quality score. No Node required."""
from pathlib import Path
import re
import quickjs
root = Path(__file__).resolve().parents[1]
s = (root / 'src/lib/carousel-guide.ts').read_text()
fn = s[s.index('export function carouselGuide('):s.index('\n/**', s.index('export function carouselGuide('))]
body = fn[fn.index('  return ['):fn.rindex('}')]
c = quickjs.Context()
c.eval('const COVER_RULE="",HOOK_QUALITY_RULE="",INNER_SLIDE={seimbang:""}; const hookGuide=()=>"";')
c.eval('function guide(hook="auto",density="seimbang",slides=undefined,hooks=[]) {' + body + '}')
guide = c.eval('guide()')
assert 'cakupan fakta' in guide and 'jalan akses' in guide, 'Missing fact-scope check: elevation is not road flood evidence'
assert 'kata bilangan' in guide and 'item berbeda' in guide, 'List check covers hooks only, not body totals'
content = (root / 'src/lib/content-ai.ts').read_text()
assert "carouselGuide('auto', DEFAULT_DENSITY, undefined, hooks)" in content
assert 'carouselGuide(hook, density, undefined, hooks)' in content
assert "reasoningEffort: 'low'" in content
print('PASS: actual shared guide scopes facts and reconciles list totals in both writer paths; latency setting preserved')
