"""Lightweight regression checks: PYTHONPATH=/tmp/carousely-qa python3 scripts/check-script-quality.py.
Executes extracted production JavaScript with QuickJS; no Node/build required.
"""
from pathlib import Path
import re
import quickjs

root = Path(__file__).resolve().parents[1]
source = (root / 'src/lib/script-options.ts').read_text()
guide = (root / 'src/lib/carousel-guide.ts').read_text()
content = (root / 'src/lib/content-ai.ts').read_text()
ctx = quickjs.Context()
ctx.eval('const HEADLINE_MAX_LENGTH=300, SCRIPT_LABEL_MAX_LENGTH=40, SCRIPT_TITLE_MAX_LENGTH=120; const lengthOf=s=>Array.from(s).length; const truncate=(s,n)=>Array.from(s).slice(0,n).join(\'\'); const text=s=>typeof s===\'string\'?s.trim():\'\'; const isObject=v=>v!==null&&typeof v===\'object\'; const notesOf=v=>({});')
clip = re.search(r'export function clip\(value: string, max: number\): string \{.*?\n\}', source, re.S)
if clip:
    ctx.eval(clip.group().replace('export ', '').replace('value: string, max: number', 'value, max').replace('): string', ')'))
clean = re.search(r'export function cleanScriptSlide\(value: unknown\): ScriptSlide \| null \{.*?\n\}', source, re.S).group()
ctx.eval(clean.replace('export ', '').replace('value: unknown', 'value').replace('): ScriptSlide | null', ')'))
assert ctx.eval("cleanScriptSlide({title:'Judul',body:'Kalimat lengkap. '+ 'olahraga '.repeat(40)}).body.endsWith('olahraga')"), 'AI body cut mid-word'
assert ctx.eval("cleanScriptSlide({title:'Judul',body:'Pendek.'}).body") == 'Pendek.'
structure = re.search(r'export function carouselStructure\(slides: number\): string \{.*?\n\}', guide, re.S).group()
ctx.eval(structure.replace('export ', '').replace('slides: number', 'slides').replace('): string', ')'))
for count in range(4, 11):
    assert 'Bridge' not in ctx.eval(f'carouselStructure({count})'), 'Mandatory bridge produces filler'
assert 'penjelasan, lalu 2–4' not in guide + content, 'Mandatory paragraph plus bullets duplicates copy'
print('PASS: production clipping, short text, structures 4–10, density constraints')
