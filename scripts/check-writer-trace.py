"""Lightweight source/runtime check: private writer trace never stores messages."""
from pathlib import Path
import quickjs
p = Path(__file__).resolve().parents[1] / 'src/lib'
c = (p / 'content-ai.ts').read_text()
n = (p / 'nine-router.ts').read_text()
assert 'sourceHash: hash({ idea: idea.title, brand, brief, language, sources, ownerRequest })' in c, 'Missing fixed-input source fingerprint'
assert 'messagesHash: hash(messages)' in c
assert 'onMetadata?.(completionMetadata(body))' in n, 'Missing safe response metadata'
start = n.index('function completionMetadata(')
end = n.index('\n/**', start)
fn = n[start:end].replace('body: unknown', 'body').replace(': CompletionMetadata', '')
ctx = quickjs.Context()
ctx.eval('const isObject = x => typeof x === "object" && x !== null;')
ctx.eval(fn)
ctx.eval('''const got = completionMetadata({model:"alias", choices:[{finish_reason:"stop",message:{content:"PRIVATE"}}],usage:{prompt_tokens:3,completion_tokens:5,secret:"PRIVATE"},secret:"PRIVATE"});
if (JSON.stringify(got).includes("PRIVATE") || got.promptTokens !== 3 || got.model !== "alias") throw Error("unsafe metadata");
if (completionMetadata(null).model !== null) throw Error("null response");''')
print('PASS: source/message hashes and allowlisted metadata; no raw messages')
