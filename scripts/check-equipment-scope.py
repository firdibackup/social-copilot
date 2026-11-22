"""Execute shared guide: supervision must not invent equipment age rules."""
from pathlib import Path
import quickjs
s=(Path(__file__).resolve().parents[1]/'src/lib/carousel-guide.ts').read_text()
f=s[s.index('export function carouselGuide('):s.index('\n/**',s.index('export function carouselGuide('))]
c=quickjs.Context()
c.eval('const COVER_RULE="",HOOK_QUALITY_RULE="",INNER_SLIDE={seimbang:""};const hookGuide=()=>"",slideGuide=()=>"";')
c.eval('function guide(hook="auto",density="seimbang",slides=undefined,hooks=[]) {'+f[f.index('  return ['):f.rindex('}')]+ '}')
g=c.eval('guide()')
assert 'alat dewasa' not in g, 'Guide invents an adult-equipment category without source evidence'
assert 'pendampingan' in g and 'batas usia' in g and 'fakta sumber' in g
print('PASS: supervision preserved; equipment age restrictions require source facts (prompt contract only)')
