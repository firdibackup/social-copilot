"""Run with PYTHONPATH=/tmp/carousely-qa python3 scripts/check-writer-boundary.py."""
from pathlib import Path
import re
import quickjs
root = Path(__file__).resolve().parents[1]
content = (root / 'src/lib/content-ai.ts').read_text()
chat = (root / 'src/lib/chat-ai.ts').read_text()
assert 'ownerRequest: turn.text' in chat, 'Original owner request is lost at ToolContext'
assert chat.count('sources,\n      context.ownerRequest,') == 2, 'Both new and revised scripts must preserve owner input'
assert '...(ownerRequest ? { ownerRequest } : {})' in content, 'Writer log must preserve provenance'
fn = content[content.index('export function buildScriptMessages('):content.index('export interface ScriptReference')]
body = fn[fn.index('  const prompt ='):fn.rindex('}')]
ctx = quickjs.Context()
ctx.eval('const MIN_SCRIPT_SLIDES=1,MAX_SLIDES=1,COVER_RULE="",SCRIPT_BODY={seimbang:""},HEADLINE_MAX_LENGTH=300,SCRIPT_EXAMPLES="",NO_INVENTED_CLAIMS="",SCRIPT_SYSTEM=""; const describeBrand=()=>"",carouselStructure=()=>"",densityRule=()=>"",carouselGuide=()=>"",scriptVisualRules=()=>"",quote=JSON.stringify,withScriptReferences=x=>x,languagePrompt=x=>x;')
ctx.eval('function build(idea,brand,hook,brief,density,language,assets,references,ownerRequest,hooks=[]) {'+body+'}')
result = ctx.eval('JSON.stringify(build("Model title",null,"auto","Ask sales only","seimbang","id",[],[],"Jelaskan DP 5% dengan contoh."))')
assert 'Jelaskan DP 5%' in result and 'Ask sales only' in result
assert 'Usulan Mimo' in result and 'Permintaan owner' in result
script_system = content[content.index('const SCRIPT_SYSTEM'):content.index('const IDEAS_SYSTEM')]
assert 'pengetahuan umum yang pasti benar' in script_system, 'System-level writer forbids general knowledge allowed by user-level guide'
assert 'describeWritingBrand(brand)' in content and "detail: ''" in content, 'Unverified strategy details still enter writer as facts'
print('PASS: owner provenance, both Mimo callers, production prompt construction, source authority')
