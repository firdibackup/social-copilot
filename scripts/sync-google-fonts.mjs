#!/usr/bin/env node
/**
 * Regenerates src/lib/google-fonts.json from the Google Fonts catalogue: every family with a latin subset, most
 * popular first, as compact tuples [name, category, weights, italicOnly?].
 *   node scripts/sync-google-fonts.mjs            # fetch https://fonts.google.com/metadata/fonts
 *   node scripts/sync-google-fonts.mjs gf.json    # use a saved copy of that response
 */
import { readFile, writeFile } from 'node:fs/promises'

const SOURCE = 'https://fonts.google.com/metadata/fonts'
const OUT = new URL('../src/lib/google-fonts.json', import.meta.url)
const CATEGORY = { 'Sans Serif': 's', Serif: 'r', Display: 'd', Handwriting: 'h', Monospace: 'm' }

async function metadata(file) {
  const text = file ? await readFile(file, 'utf8') : await (await fetch(SOURCE)).text()
  // The endpoint has historically prefixed its JSON with an anti-XSSI guard.
  return JSON.parse(text.slice(text.indexOf('{')))
}

const weightsOf = (keys) => [...new Set(keys.map(Number))].filter(Number.isFinite).sort((a, b) => a - b)

const { familyMetadataList } = await metadata(process.argv[2])
const tuples = familyMetadataList
  .filter((family) => family.subsets?.includes('latin') && CATEGORY[family.category])
  .sort((a, b) => a.popularity - b.popularity || a.family.localeCompare(b.family))
  .flatMap((family) => {
    const keys = Object.keys(family.fonts ?? {})
    const upright = weightsOf(keys.filter((key) => !key.endsWith('i')))
    if (upright.length) return [[family.family, CATEGORY[family.category], upright]]
    const italic = weightsOf(keys.filter((key) => key.endsWith('i')).map((key) => key.slice(0, -1)))
    return italic.length ? [[family.family, CATEGORY[family.category], italic, 1]] : []
  })

if (tuples.length < 1000) throw new Error(`Only ${tuples.length} families; refusing to overwrite`)
await writeFile(OUT, `[\n${tuples.map((tuple) => JSON.stringify(tuple)).join(',\n')}\n]\n`)
console.log(`Wrote ${tuples.length} families to src/lib/google-fonts.json`)
