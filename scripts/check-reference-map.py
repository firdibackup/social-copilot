"""Shared extraction scaffold preserves original prompt and reference bytes."""
from pathlib import Path
import json, quickjs
s=(Path(__file__).resolve().parents[1]/'src/lib/content-ai.ts').read_text()
f=s[s.index('function withScriptReferences('):s.index('function scriptVisualRules(')]
f=f.replace('prompt: string, references: ScriptReference[]', 'prompt, references').replace(": ChatMessage['content']",'').replace('(reference): ContentPart[] =>','(reference) =>')
c=quickjs.Context();c.eval('const REFERENCE_LABELS={cover:"Cover"};'+f)
assert c.eval('withScriptReferences("original",[])')=='original'
a=json.loads(c.eval('JSON.stringify(withScriptReferences("original",[{label:"cover",dataUrl:"data:exact"}]))'))
assert 'referenceLayouts' in a[0]['text'], 'Missing separate geometry extraction'
assert a[1]=={'type':'text','text':'original'}
assert a[-1]['image_url']['url']=='data:exact'
assert s.count('withScriptReferences(')==3
print('PASS shared extraction; no-reference unchanged; prompt/image bytes preserved')
