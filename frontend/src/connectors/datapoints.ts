export type Datapoint = {
  pk: string
  sk: string
  fields: Record<string, unknown>
}

export type DatapointType =
  | 'person'
  | 'matching-night'
  | 'match-box'
  | 'added-to-match'
  | 'unknown'

export type SeasonDatapoints = {
  pk: string
  items: Datapoint[]
  people: Datapoint[]
  matchingNights: Datapoint[]
  matchBoxes: Datapoint[]
  addedToMatches: Datapoint[]
  other: Datapoint[]
}

type DatapointsResponse = {
  items?: unknown
}

const configuredBaseUrl = import.meta.env.VITE_DATAPOINTS_API_BASE_URL?.replace(
  /\/$/,
  '',
)

const defaultBaseUrl = '/api'
const useStaticData = import.meta.env.MODE === 'github-pages'

export const SEASON_OPTIONS = [
  { key: '2022', label: '2022 Normal' },
  { key: '2022-vip', label: '2022 VIP' },
  { key: '2023', label: '2023 Normal' },
  { key: '2023-vip', label: '2023 VIP' },
  { key: '2024', label: '2024 Normal' },
  { key: '2024-vip', label: '2024 VIP' },
  { key: '2025', label: '2025 Normal' },
  { key: '2025-vip', label: '2025 VIP' },
  { key: '2026', label: '2026 Normal' },
  { key: '2026-vip', label: '2026 VIP' },
] as const

export type SeasonKey = (typeof SEASON_OPTIONS)[number]['key']

export const DEFAULT_SEASON_PK: SeasonKey = '2026-vip'

export const DATAPOINTS_ENDPOINT = useStaticData
  ? `${import.meta.env.BASE_URL}data/datapoints.json`
  : `${configuredBaseUrl || defaultBaseUrl}/datapoints`

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDatapoint(value: unknown, index: number): Datapoint | null {
  if (!isObject(value)) {
    return null
  }

  const pk = typeof value.pk === 'string' ? value.pk : `item-${index + 1}`
  const sk = typeof value.sk === 'string' ? value.sk : 'datapoint'

  return {
    pk,
    sk,
    fields: value,
  }
}

function getDatapointType(datapoint: Datapoint): DatapointType {
  const haystack = [
    datapoint.fields.type,
    datapoint.fields.kind,
    datapoint.fields.entityType,
    datapoint.pk,
    datapoint.sk,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()

  if (haystack.includes('person')) {
    return 'person'
  }

  if (
    haystack.includes('added-to-match') ||
    haystack.includes('added to match')
  ) {
    return 'added-to-match'
  }

  if (
    haystack.includes('matching-night') ||
    haystack.includes('matching night') ||
    /\bmn\b/.test(haystack)
  ) {
    return 'matching-night'
  }

  if (
    haystack.includes('match-box') ||
    haystack.includes('match box') ||
    haystack.includes('truth booth') ||
    /\bmb\b/.test(haystack)
  ) {
    return 'match-box'
  }

  return 'unknown'
}

export function splitDatapointsByType(
  items: Datapoint[],
  pk: string = DEFAULT_SEASON_PK,
): SeasonDatapoints {
  const separated: SeasonDatapoints = {
    pk,
    items,
    people: [],
    matchingNights: [],
    matchBoxes: [],
    addedToMatches: [],
    other: [],
  }

  for (const item of items) {
    const type = getDatapointType(item)

    if (type === 'person') {
      separated.people.push(item)
      continue
    }

    if (type === 'matching-night') {
      separated.matchingNights.push(item)
      continue
    }

    if (type === 'match-box') {
      separated.matchBoxes.push(item)
      continue
    }

    if (type === 'added-to-match') {
      separated.addedToMatches.push(item)
      continue
    }

    separated.other.push(item)
  }

  return separated
}

async function extractErrorMessage(response: Response) {
  if (useStaticData) {
    return `Season data could not be loaded (status ${response.status}).`
  }

  const localDevConfigurationError = getLocalDevConfigurationError(response)

  if (localDevConfigurationError) {
    return localDevConfigurationError
  }

  try {
    const payload = (await response.json()) as { error?: unknown }

    if (typeof payload.error === 'string') {
      return payload.error
    }
  } catch {
    // Fall back to the generic status message below.
  }

  return `Request failed with status ${response.status}.`
}

function getLocalDevConfigurationError(response: Response) {
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'

  if (!isLocalhost || configuredBaseUrl || response.status !== 404) {
    return null
  }

  return [
    'The request failed in the local Vite dev server before it reached Lambda or DynamoDB.',
    'Configure frontend/.env.local with `VITE_API_PROXY_TARGET=https://<your-site-url>`',
    'and restart `npm run dev` so `/api/datapoints` is proxied to the deployed backend.',
  ].join(' ')
}

export async function loadDatapoints(options?: {
  signal?: AbortSignal
  limit?: number
  pk?: string
}) {
  const limit =
    typeof options?.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(1, Math.min(Math.trunc(options.limit), 100))
      : 100

  const url = new URL(DATAPOINTS_ENDPOINT, window.location.origin)

  if (!useStaticData && options?.pk) {
    url.searchParams.set('pk', options.pk)
  } else if (!useStaticData) {
    url.searchParams.set('limit', String(limit))
  }

  const response = await fetch(url.toString(), {
    headers: {
      accept: 'application/json',
    },
    signal: options?.signal,
  })

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response))
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  if (!contentType.includes('application/json')) {
    if (useStaticData) {
      throw new Error('The season data file returned non-JSON content.')
    }

    const bodyPreview = (await response.text()).slice(0, 120)

    throw new Error(
      [
        'The API route returned non-JSON content.',
        'This usually means CloudFront routed `/api/datapoints` to the frontend bucket instead of the Lambda origin.',
        'Redeploy the infrastructure after the `/api/*` behavior fix.',
        `Received content-type: ${contentType || 'unknown'}.`,
        bodyPreview ? `Response preview: ${bodyPreview}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  const payload = (await response.json()) as DatapointsResponse
  const rawItems = Array.isArray(payload.items) ? payload.items : []

  const items = rawItems
    .map((item, index) => normalizeDatapoint(item, index))
    .filter((item): item is Datapoint => item !== null)

  if (!useStaticData) {
    return items
  }

  const selectedItems = options?.pk
    ? items.filter((item) => item.pk === options.pk)
    : items.slice(0, limit)

  return selectedItems.map((item) => {
    if (item.fields.type !== 'person' || typeof item.fields.image !== 'string') {
      return item
    }

    const imagePath = item.fields.image
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')

    return {
      ...item,
      fields: {
        ...item.fields,
        image: new URL(
          `${import.meta.env.BASE_URL}images/${imagePath}`,
          window.location.origin,
        ).href,
      },
    }
  })
}

export async function loadSeasonDatapoints(options?: {
  signal?: AbortSignal
  pk?: string
}) {
  const pk = options?.pk ?? DEFAULT_SEASON_PK
  const items = await loadDatapoints({
    signal: options?.signal,
    pk,
  })

  return splitDatapointsByType(items, pk)
}
