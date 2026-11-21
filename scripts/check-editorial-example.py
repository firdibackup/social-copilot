"""Small source contract; live saved outputs remain the quality test."""
from pathlib import Path
s = Path('src/lib/carousel-guide.ts').read_text().split('export const SCRIPT_EXAMPLES = [', 1)[1]
assert 'Contoh jadi' in s, 'Missing complete causal worked example'
assert 'karena' in s and 'bukan fakta brand' in s
assert 'Fakta contoh: perumahan' not in s, 'Avoid account-adjacent fact priming'
print('editorial example contract passed')
