"""Lightweight request contract regression; live latency requires real provider tests."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
a=(root/'src/lib/content-ai.ts').read_text();r=(root/'src/lib/nine-router.ts').read_text()
section=a[a.index('export function suggestIdeas('):a.index('/** One slide is a single post:')]
assert "{ router }), 'low')" in section, 'Cari Ide must bound reasoning effort'
assert "...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {})" in r
assert 'reasoningEffort?: \'low\'' in r
assert 'const REQUEST_TIMEOUT_MS = 120_000' in r and 'const MAX_TOKENS = 16_000' in r
assert 'const IDEAS_COUNT = 5' in a and 'ideas.length !== IDEAS_COUNT' in a
assert 'await save(ideas)' in section and "runLogged(userId, 'content_ideas'" in section
assert 'publicEncrypt' not in a and 'capture:' not in section
print('PASS: scoped effort, five-result/parser/save/charging, timeout and token cap preserved; capture removed')
