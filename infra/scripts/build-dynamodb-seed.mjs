#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const dataRoot = path.join(repoRoot, 'data')
const outputRoot = path.join(dataRoot, 'dynamodb-batches')
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function main() {
  const tableName = getArgValue('--table')

  if (!tableName) {
    throw new Error('Usage: node infra/scripts/build-dynamodb-seed.mjs --table <table-name>')
  }

  const { items, notes } = buildSeedItems()

  fs.rmSync(outputRoot, { recursive: true, force: true })
  fs.mkdirSync(outputRoot, { recursive: true })

  const batches = chunk(items, 25).map((batchItems, index) => {
    const payload = {
      [tableName]: batchItems.map((Item) => ({ PutRequest: { Item } })),
    }
    const filename = `batch-${String(index + 1).padStart(3, '0')}.json`
    fs.writeFileSync(
      path.join(outputRoot, filename),
      `${JSON.stringify(payload, null, 2)}\n`,
    )
    return filename
  })

  const notesPath = path.join(repoRoot, 'notes.md')
  fs.writeFileSync(notesPath, buildNotes(items, batches, notes), 'utf8')

  const summary = {
    tableName,
    itemCount: items.length,
    batchCount: batches.length,
    outputRoot: path.relative(repoRoot, outputRoot),
    notesPath: path.relative(repoRoot, notesPath),
    countsByType: countByType(items),
  }

  console.log(JSON.stringify(summary, null, 2))
}

export function buildSeedItems() {
  const notes = []
  const items = []

  for (const season of listSeasonDirectories()) {
    const seasonPath = path.join(dataRoot, season)
    const manifestNames = loadManifestNames(seasonPath)

    items.push(...buildPersonItems(season, seasonPath, manifestNames, notes))
    items.push(...buildMatchingNightItems(season, seasonPath, notes))
    items.push(...buildMatchBoxItems(season, seasonPath, notes))
    items.push(...buildAddedToMatchItems(season, seasonPath, notes))
  }

  return { items, notes }
}

function getArgValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1] ?? null
}

function listSeasonDirectories() {
  return fs
    .readdirSync(dataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name !== path.basename(outputRoot))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

function loadManifestNames(seasonPath) {
  const manifestPath = path.join(seasonPath, '_manifest.json')
  const namesByFile = new Map()

  if (!fs.existsSync(manifestPath)) {
    return namesByFile
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  for (const entry of manifest.downloaded ?? []) {
    if (typeof entry.file === 'string' && typeof entry.name === 'string') {
      namesByFile.set(entry.file, entry.name)
    }
  }

  return namesByFile
}

function buildPersonItems(season, seasonPath, manifestNames, notes) {
  const imageFiles = fs
    .readdirSync(seasonPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((filename) => imageExtensions.has(path.extname(filename).toLowerCase()))
    .sort((left, right) => left.localeCompare(right))

  if (manifestNames.size > 0) {
    const imageFileSet = new Set(imageFiles)
    const manifestImageFiles = [...manifestNames.keys()]
      .filter((imagePath) => imagePath.startsWith(`${season}/`))
      .map((imagePath) => imagePath.slice(season.length + 1))
    const manifestImageFileSet = new Set(manifestImageFiles)
    const extraImageFiles = imageFiles.filter(
      (filename) => !manifestImageFileSet.has(filename),
    )

    if (extraImageFiles.length > 0) {
      notes.push(
        `${season}: ignored ${extraImageFiles.length} image file(s) not listed in _manifest.json.`,
      )
    }

    return manifestImageFiles
      .filter((filename) => {
        if (imageFileSet.has(filename)) {
          return true
        }

        notes.push(`${season}: missing manifest image file ${filename}.`)
        return false
      })
      .sort((left, right) => left.localeCompare(right))
      .map((filename) => buildPersonItem(season, filename, manifestNames))
  }

  return imageFiles.map((filename) => buildPersonItem(season, filename, manifestNames))
}

function buildPersonItem(season, filename, manifestNames) {
  const stem = path.basename(filename, path.extname(filename)).toLowerCase()
  const imagePath = `${season}/${filename}`

  return {
    pk: s(season),
    sk: s(stem),
    image: s(imagePath),
    name: s(manifestNames.get(imagePath) ?? titleFromImageStem(stem)),
    type: s('person'),
  }
}

function buildMatchingNightItems(season, seasonPath, notes) {
  const filePath = path.join(seasonPath, 'matching_nights.txt')

  if (!fs.existsSync(filePath)) {
    notes.push(`${season}: missing matching_nights.txt`)
    return []
  }

  const nights = []
  let current = null

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    const header = line.match(/^Matchnight\s+#(\d+)(?:\s+[—-]\s+Matches:\s*(.+))?$/i)

    if (header) {
      if (current) {
        nights.push(current)
      }

      current = {
        number: Number.parseInt(header[1], 10),
        matches: parseKnownNumber(header[2]),
        rawMatches: header[2] ?? null,
        pairs: [],
        singles: [],
        sold: false,
        soldPrice: null,
      }
      continue
    }

    if (!current) {
      continue
    }

    const pair = line.match(/^-\s*(.+?)\s+x\s+(.+)$/i)

    if (pair) {
      current.pairs.push([pair[1].trim(), pair[2].trim()])
      continue
    }

    const singles = line.match(/^Geht leer aus:\s*(.+)$/i)

    if (singles) {
      current.singles.push(
        ...singles[1]
          .split(/\s*(?:,|\bund\b)\s*/i)
          .map((name) => name.trim())
          .filter(Boolean),
      )
      continue
    }

    const sold = line.match(/^Verkauft(?:\s+für)?\s*:?\s*(\d+)?/i)

    if (sold) {
      current.sold = true
      current.soldPrice = sold[1] ? Number.parseInt(sold[1], 10) : null
    }
  }

  if (current) {
    nights.push(current)
  }

  return nights.flatMap((night) => {
    if (typeof night.matches !== 'number' && !night.sold) {
      notes.push(
        `${season}: skipped Matchnight #${pad(night.number)} because matches value is not numeric (${night.rawMatches ?? 'missing'}).`,
      )
      return []
    }

    const item = {
      pk: s(season),
      sk: s(`${season}-MN-${night.number}`),
      'matching-night': n(night.number),
      pairs: {
        L: night.pairs.map(([female, male]) => ({
          M: {
            female: s(female),
            male: s(male),
          },
        })),
      },
      type: s('matching-night'),
    }

    if (typeof night.matches === 'number') {
      item.matches = n(night.matches)
    }

    if (night.singles.length > 0) {
      item.singles = {
        L: night.singles.map((name) => s(name)),
      }
    }

    if (night.sold) {
      item.result = s('sold')
      item.sold = { BOOL: true }

      if (typeof night.soldPrice === 'number') {
        item['sold-price'] = n(night.soldPrice)
      }
    }

    if (night.pairs.length === 0 && !night.sold) {
      notes.push(`${season}: Matchnight #${pad(night.number)} contains no pairs.`)
    }

    return item
  })
}

function buildMatchBoxItems(season, seasonPath, notes) {
  const filePath = path.join(seasonPath, 'match_boxes.txt')

  if (!fs.existsSync(filePath)) {
    notes.push(`${season}: missing match_boxes.txt`)
    return []
  }

  const seenSk = new Map()
  const items = []

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line) {
      continue
    }

    const match = line.match(
      /^Matchbox\s+#(\d+):\s*(.+?)\s+x\s+(.+?)\s*->\s*(\S+)(?:\s+(\d+))?(?:\s+\(before Matchnight\s+#?(\d+)\))?$/i,
    )

    if (!match) {
      notes.push(`${season}: could not parse match box line: ${line}`)
      continue
    }

    const number = Number.parseInt(match[1], 10)
    const baseSk = `${season}-MB-${number}`
    const duplicateCount = seenSk.get(baseSk) ?? 0
    seenSk.set(baseSk, duplicateCount + 1)

    const sk = duplicateCount === 0 ? baseSk : `${baseSk}-${duplicateCount + 1}`

    if (duplicateCount > 0) {
      notes.push(
        `${season}: duplicate Matchbox #${pad(number)} stored as ${sk} to avoid overwriting ${baseSk}.`,
      )
    }

    const result = parseMatchBoxResult(match[4], match[5])
    const matchingNight = match[6]
      ? Number.parseInt(match[6], 10)
      : number

    if (result.kind === 'unknown') {
      notes.push(`${season}: Matchbox #${pad(number)} result is unknown.`)
    }

    const item = {
      pk: s(season),
      sk: s(sk),
      female: s(match[2].trim()),
      male: s(match[3].trim()),
      'match-box': n(number),
      'matching-night': n(matchingNight),
      result: result.attribute,
      type: s('match-box'),
    }

    if (result.kind === 'sold') {
      item.sold = { BOOL: true }

      if (typeof result.soldPrice === 'number') {
        item['sold-price'] = n(result.soldPrice)
      }
    }

    items.push(item)
  }

  return items
}

function buildAddedToMatchItems(season, seasonPath, notes) {
  const filePath = path.join(seasonPath, 'added_to_matches.json')

  if (!fs.existsSync(filePath)) {
    return []
  }

  const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  if (!Array.isArray(entries)) {
    notes.push(`${season}: added_to_matches.json must contain an array.`)
    return []
  }

  return entries.flatMap((entry, index) => {
    const person = typeof entry?.person === 'string' ? entry.person.trim() : ''
    const targetLeft =
      typeof entry?.targetLeft === 'string' ? entry.targetLeft.trim() : ''
    const targetRight =
      typeof entry?.targetRight === 'string' ? entry.targetRight.trim() : ''
    const matchingNight = Number(entry?.matchingNight)

    if (
      !person ||
      !targetLeft ||
      !targetRight ||
      !Number.isInteger(matchingNight) ||
      matchingNight < 1
    ) {
      notes.push(
        `${season}: skipped invalid added-to-match entry ${index + 1}.`,
      )
      return []
    }

    return {
      pk: s(season),
      sk: s(`${season}-ATM-${index + 1}`),
      'added-person': s(person),
      'target-left': s(targetLeft),
      'target-right': s(targetRight),
      'matching-night': n(matchingNight),
      type: s('added-to-match'),
    }
  })
}

function parseKnownNumber(value) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null
}

function parseMatchBoxResult(value, soldPrice) {
  const normalized = value.trim().toLowerCase()

  if (normalized === 'true') {
    return { kind: 'known', attribute: { BOOL: true } }
  }

  if (normalized === 'false') {
    return { kind: 'known', attribute: { BOOL: false } }
  }

  if (normalized === 'sold' || normalized === 'verkauft') {
    return {
      kind: 'sold',
      attribute: s('sold'),
      soldPrice: soldPrice ? Number.parseInt(soldPrice, 10) : null,
    }
  }

  return { kind: 'unknown', attribute: s(normalized) }
}

function titleFromImageStem(stem) {
  return stem
    .split('-')
    .map((part) => {
      if (/^\d+$/.test(part)) {
        return part
      }

      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function buildNotes(items, batches, notes) {
  const counts = countByType(items)
  const noteLines = notes.length > 0 ? notes.map((note) => `- ${note}`) : ['- None.']

  return [
    '# Data Load Notes',
    '',
    `Generated ${items.length} DynamoDB items in ${batches.length} batch files.`,
    '',
    '## Counts',
    '',
    `- person: ${counts.person ?? 0}`,
    `- matching-night: ${counts['matching-night'] ?? 0}`,
    `- match-box: ${counts['match-box'] ?? 0}`,
    `- added-to-match: ${counts['added-to-match'] ?? 0}`,
    '',
    '## Data Issues',
    '',
    ...noteLines,
    '',
  ].join('\n')
}

function countByType(items) {
  return items.reduce((counts, item) => {
    const type = item.type.S
    counts[type] = (counts[type] ?? 0) + 1
    return counts
  }, {})
}

function chunk(values, size) {
  const chunks = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

function s(value) {
  return { S: String(value) }
}

function n(value) {
  return { N: String(value) }
}

function pad(value) {
  return String(value).padStart(2, '0')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
