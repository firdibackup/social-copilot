"""QuickJS regression for non-rendered notes; optional private raw capture replay."""
from pathlib import Path
import json,re,sys
import quickjs
source=(Path(__file__).resolve().parents[1]/'src/lib/script-options.ts').read_text()
ctx=quickjs.Context()
ctx.eval("const SCRIPT_NOTE_MAX_LENGTH=300; const truncate=(s,n)=>Array.from(s).slice(0,n).join(''); const text=v=>typeof v==='string'?v.replace(/\\r\\n/g,'\\n').trim():'';")
fn=re.search(r'function notesOf\(.*?\n\}',source,re.S).group()
fn=fn.replace("value: Json",'value').replace(": Pick<ScriptSlide, 'visual' | 'layout'>",'').replace('item: unknown','item')
ctx.eval(fn)
notes=['A complete geometry description '+('with deliberate spacing and alignment, '*9)+'ending here.']
if len(sys.argv)>1:
 raw=Path(sys.argv[1]).read_text(); notes += [s['layout'] for s in json.loads(raw[raw.index('{'):raw.rindex('}')+1])['slides']]
for note in notes:
 result=json.loads(ctx.eval('JSON.stringify(notesOf('+json.dumps({'layout':note})+'))'))
 assert result['layout']==note,'Complete non-rendered Layout was silently clipped'
assert ctx.eval("JSON.stringify(notesOf({visual:123,layout:null}))")=='{}'
assert ctx.eval("notesOf({visual:'  Photo\\nGym  '}).visual")=='Photo Gym'
print('PASS: full notes retained, malformed/empty omitted, newline normalization; samples',len(notes))
