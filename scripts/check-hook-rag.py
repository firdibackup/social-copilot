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
print(f'PASS: {len(k["templates"])} exact seeds; {len(k["rules"])} rules; all four runtime paths')
