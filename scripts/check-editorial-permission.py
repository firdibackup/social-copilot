from pathlib import Path
s = Path('src/lib/content-ai.ts').read_text()
assert 'boleh dipakai untuk isi edukasi' not in s, 'Generic reasoning still conditional on education classification'
assert 'pengetahuan umum yang pasti benar untuk konten edukasi' not in s
assert s.count('termasuk konten pengenalan fasilitas dan promo') == 3
assert 'Klaim tentang brand hanya dari fakta yang tertulis' in s
print('editorial permission contract passed')
