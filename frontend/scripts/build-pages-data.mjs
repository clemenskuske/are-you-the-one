import fs from 'node:fs'
import path from 'node:path'
import { buildSeedItems } from '../../infra/scripts/build-dynamodb-seed.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const distRoot = path.join(repoRoot, 'frontend/dist')
const { items: seedItems, notes } = buildSeedItems()

function decodeAttribute(attribute) {
  if ('S' in attribute) return attribute.S
  if ('N' in attribute) return Number(attribute.N)
  if ('BOOL' in attribute) return attribute.BOOL
  if ('NULL' in attribute) return null
  if ('L' in attribute) return attribute.L.map(decodeAttribute)
  if ('M' in attribute) {
    return Object.fromEntries(
      Object.entries(attribute.M).map(([key, value]) => [key, decodeAttribute(value)]),
    )
  }
  throw new Error(`Unsupported DynamoDB attribute: ${JSON.stringify(attribute)}`)
}

const items = seedItems
  .map((item) => decodeAttribute({ M: item }))
  .sort((left, right) => left.pk.localeCompare(right.pk) || left.sk.localeCompare(right.sk))

fs.mkdirSync(path.join(distRoot, 'data'), { recursive: true })
fs.writeFileSync(
  path.join(distRoot, 'data/datapoints.json'),
  `${JSON.stringify({ items, count: items.length, hasMore: false })}\n`,
)

for (const item of items.filter((item) => item.type === 'person')) {
  const destination = path.join(distRoot, 'images', item.image)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(path.join(repoRoot, 'data', item.image), destination)
}

fs.writeFileSync(path.join(distRoot, '.nojekyll'), '')
console.log(`Exported ${items.length} datapoints and ${items.filter((item) => item.type === 'person').length} cast images.`)
for (const note of notes) console.warn(note)
