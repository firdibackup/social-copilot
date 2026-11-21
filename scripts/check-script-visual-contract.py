"""Lightweight shared Visual/Layout ownership contract (no model call)."""
from pathlib import Path
import quickjs
s = (Path(__file__).resolve().parents[1] / 'src/lib/content-ai.ts').read_text()
f = s[s.index('function scriptVisualRules('):s.index('/** Strategy angles')]
f = f.replace('references: ScriptReference[]', 'references').replace('): string {', ') {')
c = quickjs.Context(); c.eval(f)
for refs in ('[]', '[{}]'):
    rules = c.eval('scriptVisualRules('+refs+')')
    assert 'nama warna atau font' in rules, 'Writer cannot resolve palette/fonts absent from BrandContext'
    assert 'subjek dari Visual' in rules, 'Reference subjects must not override selected Visual'
assert s.count('scriptVisualRules(') == 3, 'Both writer entry points share contract'
print('PASS: shared layout is geometry-only; Visual owns subject')
