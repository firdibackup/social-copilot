"""Lightweight hook RAG contract; run with python3 (no Node/build)."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
k = json.loads((root / 'src/lib/hook-knowledge.json').read_text())
guide = (root / 'src/lib/hook-guide.ts').read_text()
assert 'knowledge.templates.map' not in guide, 'full template stuffing must be removed'
assert 'knowledge.rules.map' in guide
sql = (root / 'supabase/migrations/20261122000000_hook_retrieval.sql').read_text()
for t in k['templates']:
    assert t['structure'].replace("'", "''") in sql and t['id'] in sql
assert 'enable row level security' in sql
assert 'from public, anon, authenticated' in sql
assert 'limit 3' in sql
for file, count in [('content-ai.ts', 3), ('chat-ai.ts', 1)]:
    code = (root / 'src/lib' / file).read_text()
    assert code.count('await retrieveHooks(') == count, file
# Execute the actual formatter in QuickJS; no Node toolchain required.
import sys
sys.path.insert(0, '/tmp/carousely-qa')
import quickjs
ctx = quickjs.Context()
js = guide[guide.index('/** General'):].replace('export function', 'function').replace('templates: HookTemplate[] = []', 'templates = []').replace('): string', ')')
ctx.eval('const knowledge = ' + json.dumps(k) + ';' + js)
assert all(t['structure'] not in ctx.eval('hookGuide()') for t in k['templates'])
rows = [dict(id=t['id'], structure=t['structure'], use_when=t['useWhen']) for t in k['templates']]
ctx.eval('const selected = ' + json.dumps(rows))
prompt = ctx.eval('hookGuide(selected)')
assert all(t['structure'] in prompt for t in k['templates'][:3])
assert all(t['structure'] not in prompt for t in k['templates'][3:])
# Exercise actual async retrieval success, empty match and outage branches.
import re
retrieval = (root / 'src/lib/hook-retrieval.ts').read_text()
body = retrieval[retrieval.index('/** ponytail'):]
body = re.sub(r'export async function retrieveHooks\(query: string\): Promise<.*?>', 'async function retrieveHooks(query)', body)
body = body.replace(' as HookTemplate[]', '')
ctx.eval('const console = {warn() {}}; const AbortSignal = {timeout() {return null}}; let mode = 0; let sent; function db() { return {rpc(name, args) {sent=args.query_text; return {abortSignal() {if(mode===2) throw Error("offline"); return Promise.resolve({data: mode===1 ? [] : selected.slice(0,3), error:null})}}}}};' + body)
for mode, source, count in [(0, 'supabase', 3), (1, 'supabase', 0), (2, 'rules-only', 0)]:
    ctx.eval(f'mode={mode}; var result; retrieveHooks("x".repeat(7000)).then(r => result=JSON.stringify(r))')
    while ctx.execute_pending_job(): pass
    result = json.loads(ctx.eval('result'))
    assert result['source'] == source and len(result['templates']) == count
    assert ctx.eval('sent.length') == 6000
print(f'PASS: {len(k["templates"])} exact seeds; {len(k["rules"])} rules; all four runtime paths')
