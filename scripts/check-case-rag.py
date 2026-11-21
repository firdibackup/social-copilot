"""Runnable case retrieval/formatting regression without Node."""
import json, re, sys
from pathlib import Path
sys.path.insert(0, '/tmp/carousely-qa')
import quickjs
root = Path(__file__).resolve().parents[1]
p = root / 'src/lib/case-retrieval.ts'
assert p.exists(), 'case retrieval missing'
s = p.read_text()
body = s[s.index('export function caseGuide'):s.index('export async function')]
body = body.replace('export function', 'function').replace('cases: StudyCase[]', 'cases').replace('): string', ')')
c = quickjs.Context(); c.eval(body)
rows = [dict(id=str(i), verdict='failure', excerpt='bad copy', reason='unsupported', principle='retain scope', assessment='model', outcome='correction_unvalidated') for i in range(5)]
prompt=c.eval('caseGuide('+json.dumps(rows)+')')
assert prompt.count('bad copy') == 2
assert 'failure' in prompt and 'correction_unvalidated' in prompt and 'model' in prompt
assert c.eval('caseGuide([])') == ''
sql=(root/'supabase/migrations/20261122010000_study_cases.sql').read_text()
for required in ['enable row level security','from public, anon, authenticated','c.user_id = p_user_id','c.account_id = p_account_id','instagram_connections','limit 2']:
 assert required in sql, required
assert 'human_approved' in sql and 'correction_unvalidated' in sql
print('PASS: bounded case guide, explicit assessment/status, ownership contract')
