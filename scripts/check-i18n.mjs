#!/usr/bin/env node
// Vérifie que en.json et de.json ont exactement les mêmes clés que fr.json (référence).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'i18n', 'locales')
const load = (l) => JSON.parse(readFileSync(join(dir, `${l}.json`), 'utf8'))

function flatten(obj, prefix = '') {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...flatten(v, key))
    else keys.push(key)
  }
  return keys
}

const ref = new Set(flatten(load('fr')))
let failed = false

for (const lang of ['en', 'de']) {
  const cur = new Set(flatten(load(lang)))
  const missing = [...ref].filter((k) => !cur.has(k))
  const extra = [...cur].filter((k) => !ref.has(k))
  if (missing.length || extra.length) {
    failed = true
    console.log(`\n[${lang}]`)
    missing.forEach((k) => console.log(`  MANQUANT : ${k}`))
    extra.forEach((k) => console.log(`  EN TROP  : ${k}`))
  }
}

if (failed) {
  console.log('\n❌ Clés i18n désynchronisées.')
  process.exit(1)
}
console.log('✅ Clés i18n synchronisées (fr / en / de).')
