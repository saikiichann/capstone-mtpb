// Read-only: prints the shape of every collection in a Firestore project, so
// the violator app can be mapped onto a database someone else designed.
//
// It NEVER writes, updates or deletes anything. It reads a few documents per
// collection and reports field names, types and example values.
//
// Personal data: documents in `users` (and anything else listed in PRIVATE)
// have their VALUES hidden — only field names and types are printed. Field
// names are all the mapping needs; names, emails and phone numbers are not
// ours to copy around.
//
// Usage:
//   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\key.json"
//   node scripts/inspect-schema.mjs
//
//   node scripts/inspect-schema.mjs --collection violations --limit 5
import { readFileSync } from 'node:fs'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Collections whose values stay hidden.
const PRIVATE = ['users', 'Violators', 'violators']
const DEFAULT_LIMIT = 3
const MAX_VALUE_LENGTH = 60

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue
    args[argv[i].slice(2)] = argv[i + 1]
    i += 1
  }
  return args
}

function typeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${value.length})`
  if (value?.toDate instanceof Function) return 'timestamp'
  if (value?.latitude !== undefined && value?.longitude !== undefined) return 'geopoint'
  if (value?.path && value?.id) return 'reference'
  if (typeof value === 'object') return 'map'
  return typeof value
}

function show(value) {
  if (value === null) return 'null'
  if (value?.toDate instanceof Function) return value.toDate().toISOString()
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[${show(value[0])}${value.length > 1 ? ', …' : ''}]`
  }
  if (typeof value === 'object') return `{ ${Object.keys(value).join(', ')} }`
  const text = typeof value === 'string' ? `"${value}"` : String(value)
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…"` : text
}

const args = parseArgs(process.argv.slice(2))
const limit = Number(args.limit ?? DEFAULT_LIMIT)

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!keyPath) {
  console.error('\n  Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.\n')
  process.exit(1)
}

let serviceAccount
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
} catch (error) {
  console.error(`\n  Could not read ${keyPath}\n  ${error.message}\n`)
  process.exit(1)
}

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

console.log(`\n  Project: ${serviceAccount.project_id}`)
console.log('  Read-only inspection — nothing is written.\n')

const collections = args.collection
  ? [db.collection(args.collection)]
  : await db.listCollections()

for (const collection of collections) {
  const name = collection.id
  const hidden = PRIVATE.includes(name)
  const snapshot = await collection.limit(limit).get()

  console.log(`\n${'='.repeat(64)}`)
  console.log(`${name}  (${snapshot.size} document${snapshot.size === 1 ? '' : 's'} sampled)`)
  if (hidden) console.log('values hidden — personal data')
  console.log('='.repeat(64))

  if (snapshot.empty) {
    console.log('  (empty)')
    continue
  }

  // Which fields appear across the sampled documents, and how often.
  const fields = new Map()
  for (const doc of snapshot.docs) {
    for (const [key, value] of Object.entries(doc.data())) {
      if (!fields.has(key)) fields.set(key, { type: typeOf(value), example: value, count: 0 })
      fields.get(key).count += 1
    }
  }

  console.log(`  document id example:  ${snapshot.docs[0].id}`)
  console.log('')

  for (const [key, info] of [...fields].sort()) {
    const everywhere = info.count === snapshot.size ? '' : `  (in ${info.count}/${snapshot.size})`
    const value = hidden ? '' : `  =  ${show(info.example)}`
    console.log(`  ${key.padEnd(22)} ${info.type.padEnd(12)}${value}${everywhere}`)
  }

  // For status-ish fields, list every distinct value in the sample — this is
  // what decides how statuses map onto the app's own vocabulary.
  const statusFields = [...fields.keys()].filter((k) => /status|state|stage/i.test(k))
  if (statusFields.length > 0 && !hidden) {
    console.log('')
    for (const field of statusFields) {
      const seen = new Set(snapshot.docs.map((d) => d.data()[field]).filter((v) => v !== undefined))
      console.log(`  values of ${field}: ${[...seen].map((v) => `"${v}"`).join(', ')}`)
    }
  }
}

console.log('\n')
