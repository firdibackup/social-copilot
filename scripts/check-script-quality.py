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
# Thin facts + "unknown details = hal yang perlu dicek" filled W ideas with ask/check advice (85% of inner slides).
assert 'ditulis sebagai hal yang perlu dicek' not in guide, 'Unknown details routed to check/ask filler'
assert 'paling banyak satu kalimat seperti itu per carousel' in guide, 'Deferral advice is unbounded'
ideas_system = re.search(r'const IDEAS_SYSTEM = \[.*?\]\.join', content, re.S).group()
assert 'pengetahuan umum yang pasti benar' in ideas_system, 'Cari Ide forbids general knowledge, script path allows it'
assert 'Saat survei, coba rute' not in guide and 'Sebelum berlangganan, cek tiga batas' not in guide, 'Worked examples still teach deferral instead of delivering value'
chat = (root / 'src/lib/chat-ai.ts').read_text()
assert 'Jangan ubah permintaan edukasi menjadi daftar pertanyaan' in chat, 'Mimo brief converts education into deferred answers'
visual_rules = re.search(r'function scriptVisualRules\(.*?\n\}', content, re.S).group()
assert 'Nama berbeda berarti identitas berbeda' in visual_rules, 'Photo identity can replace the named facility'
print('PASS: production clipping, short text, structures 4–10, density constraints, asset identity')
