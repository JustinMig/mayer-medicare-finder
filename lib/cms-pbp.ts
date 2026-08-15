import { inflateRawSync } from 'node:zlib'

export const CMS_PBP_2026_URL = 'https://www.cms.gov/files/zip/pbp-benefits-2026-json.zip'

type JsonObject = Record<string, unknown>
type FlatLeaf = { path: string; value: string }

function isObject(value: unknown): value is JsonObject { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function normalizeKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') }
function text(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function directScalar(obj: JsonObject, patterns: RegExp[]) {
  for (const [key, value] of Object.entries(obj)) {
    if (!patterns.some((pattern) => pattern.test(normalizeKey(key)))) continue
    const scalar = text(value)
    if (scalar) return scalar
  }
  return null
}

function flatten(value: unknown, prefix = '', depth = 0, out: FlatLeaf[] = []): FlatLeaf[] {
  if (depth > 8 || out.length > 12000) return out
  if (Array.isArray(value)) {
    value.slice(0, 500).forEach((item, index) => flatten(item, `${prefix}[${index}]`, depth + 1, out))
    return out
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, depth + 1, out)
    return out
  }
  const scalar = text(value)
  if (scalar) out.push({ path: prefix, value: scalar })
  return out
}

function money(value: string) {
  const match = value.replace(/,/g, '').match(/\$?(-?\d+(?:\.\d+)?)/)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(amount)
}

function relevantLeaves(leaves: FlatLeaf[], terms: RegExp[]) {
  return leaves.filter((leaf) => terms.every((term) => term.test(`${normalizeKey(leaf.path)} ${leaf.value.toLowerCase()}`)))
}

function bestText(leaves: FlatLeaf[], anyTerms: RegExp[], preferredTerms: RegExp[] = []) {
  const candidates = leaves.filter((leaf) => anyTerms.some((term) => term.test(`${normalizeKey(leaf.path)} ${leaf.value.toLowerCase()}`)))
  const scored = candidates.map((leaf) => {
    const hay = `${normalizeKey(leaf.path)} ${leaf.value.toLowerCase()}`
    let score = anyTerms.filter((term) => term.test(hay)).length * 3
    score += preferredTerms.filter((term) => term.test(hay)).length * 5
    if (/copay|coinsurance|allowance|maximum|benefit|amount|reduction|rebate|credit/.test(hay)) score += 2
    if (/\$\s*\d|\d+\s*%/.test(leaf.value)) score += 4
    if (leaf.value.length > 240) score -= 2
    return { leaf, score }
  }).sort((a, b) => b.score - a.score)
  return scored[0]?.leaf.value || null
}

function amountAndFrequency(leaves: FlatLeaf[], terms: RegExp[]) {
  const candidates = leaves.filter((leaf) => terms.some((term) => term.test(`${normalizeKey(leaf.path)} ${leaf.value.toLowerCase()}`)))
  const amountLeaf = candidates.map((leaf) => ({ leaf, amount: money(leaf.value), score: (/allowance|amount|maximum|benefit/.test(normalizeKey(leaf.path)) ? 4 : 0) + (money(leaf.value) ? 5 : 0) }))
    .filter((item) => item.amount)
    .sort((a, b) => b.score - a.score)[0]
  const combined = candidates.map((leaf) => leaf.value).join(' · ')
  const frequency = /quarter/i.test(combined) ? 'quarter' : /month/i.test(combined) ? 'month' : /annual|annually|year/i.test(combined) ? 'year' : null
  return { amount: amountLeaf?.amount || null, frequency }
}

export function extractPbpBenefits(raw: JsonObject) {
  const leaves = flatten(raw)
  const otc = amountAndFrequency(leaves, [/\botc\b/i, /over.?the.?counter/i])
  const food = amountAndFrequency(leaves, [/food/i, /grocery/i, /healthy.?food/i])
  const dental = amountAndFrequency(leaves, [/dental/i])
  const vision = amountAndFrequency(leaves, [/vision/i, /eyewear/i, /glasses/i])
  const hearing = amountAndFrequency(leaves, [/hearing/i, /hearing.?aid/i])

  return {
    dental_annual_allowance: dental.amount,
    vision_annual_allowance: vision.amount,
    hearing_annual_allowance: hearing.amount,
    otc_amount: otc.amount,
    otc_frequency: otc.frequency,
    food_amount: food.amount,
    food_frequency: food.frequency,
    ambulance_copay: bestText(leaves, [/ambulance/i], [/copay/i, /coinsurance/i, /cost.?share/i]),
    emergency_room_copay: bestText(leaves, [/emergency.?room/i, /emergency.?care/i], [/copay/i, /coinsurance/i]),
    urgent_care_copay: bestText(leaves, [/urgent.?care/i], [/copay/i, /coinsurance/i]),
    inpatient_hospital: bestText(leaves, [/inpatient/i, /hospital/i], [/day/i, /copay/i, /coinsurance/i]),
    part_b_credit_monthly: bestText(leaves, [/part.?b/i], [/reduction/i, /rebate/i, /giveback/i, /credit/i]),
    source_leaf_count: leaves.length
  }
}

function planIdentity(obj: JsonObject) {
  const contract = directScalar(obj, [/^contract(_id|id|number|num)?$/, /^contract_id/])
  const plan = directScalar(obj, [/^plan(_id|id|number|num)?$/, /^plan_id/])
  const segment = directScalar(obj, [/^segment(_id|id|number|num)?$/, /^segment_id/]) || '0'
  if (!contract || !/^[A-Z]\d{4}$/i.test(contract) || !plan || !/^\d{1,3}$/.test(plan)) return null
  return { contract_id: contract.toUpperCase(), plan_id: plan.padStart(3, '0'), segment_id: (/^\d+$/.test(segment) ? String(Number(segment)) : segment) }
}

function benefitScore(obj: JsonObject) {
  const leaves = flatten(obj)
  const joined = leaves.slice(0, 2000).map((leaf) => normalizeKey(leaf.path)).join(' ')
  const terms = ['dental','vision','hearing','ambulance','hospital','otc','food','part_b','emergency','urgent']
  return Math.min(leaves.length, 5000) + terms.filter((term) => joined.includes(term)).length * 1000
}

export function collectPbpPlanObjects(root: unknown, targetKeys: Set<string>) {
  const best = new Map<string, { raw: JsonObject; score: number }>()
  const stack: unknown[] = [root]
  let visited = 0
  while (stack.length && visited < 250000) {
    const current = stack.pop()
    visited += 1
    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i--) stack.push(current[i])
      continue
    }
    if (!isObject(current)) continue
    const identity = planIdentity(current)
    if (identity) {
      const key = `${identity.contract_id}-${identity.plan_id}-${identity.segment_id}`
      if (targetKeys.has(key)) {
        const score = benefitScore(current)
        if (!best.has(key) || score > (best.get(key)?.score || 0)) best.set(key, { raw: current, score })
      }
    }
    for (const value of Object.values(current)) if (value && typeof value === 'object') stack.push(value)
  }
  return best
}

function findEocd(buffer: Buffer) {
  const min = Math.max(0, buffer.length - 65557)
  for (let offset = buffer.length - 22; offset >= min; offset--) if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  return -1
}

export function unzipJsonEntries(buffer: Buffer) {
  const eocd = findEocd(buffer)
  if (eocd < 0) throw new Error('CMS PBP ZIP end record was not found.')
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  const entries: Array<{ name: string; json: unknown }> = []
  let cursor = centralOffset

  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const filenameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.subarray(cursor + 46, cursor + 46 + filenameLength).toString('utf8')
    cursor += 46 + filenameLength + extraLength + commentLength
    if (!/\.json$/i.test(name)) continue
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) continue
    const localFilenameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localFilenameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    const bytes = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null
    if (!bytes) continue
    try { entries.push({ name, json: JSON.parse(bytes.toString('utf8')) }) } catch {}
  }
  return entries
}

export async function downloadCmsPbpArchive() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  try {
    const response = await fetch(CMS_PBP_2026_URL, { headers: { Accept: 'application/zip,*/*' }, cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error(`CMS PBP download failed (${response.status})`)
    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > 350 * 1024 * 1024) throw new Error('CMS PBP archive exceeds the importer safety limit.')
    return Buffer.from(arrayBuffer)
  } finally { clearTimeout(timer) }
}
