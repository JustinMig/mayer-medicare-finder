import { NextResponse } from 'next/server'
import { inflateRawSync } from 'node:zlib'

export const runtime = 'nodejs'
export const maxDuration = 120

const LANDSCAPE_URL = 'https://www.cms.gov/files/zip/cy2027-landscape-202609-1.zip'

function findEocd(buffer: Buffer) {
  const min = Math.max(0, buffer.length - 65557)
  for (let offset = buffer.length - 22; offset >= min; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset
  }
  return -1
}

function unzipTextEntries(buffer: Buffer) {
  const eocd = findEocd(buffer)
  if (eocd < 0) throw new Error('ZIP end record not found')
  const entryCount = buffer.readUInt16LE(eocd + 10)
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  const entries: Array<{ name: string; text: string }> = []
  let cursor = centralOffset
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const filenameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.subarray(cursor + 46, cursor + 46 + filenameLength).toString('utf8')
    cursor += 46 + filenameLength + extraLength + commentLength
    if (!/\.(csv|txt)$/i.test(name)) continue
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) continue
    const localFilenameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localFilenameLength + localExtraLength
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize)
    const bytes = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null
    if (bytes) entries.push({ name, text: bytes.toString('utf8').replace(/^\uFEFF/, '') })
  }
  return entries
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else {
      if (ch === '"') quoted = true
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
      else field += ch
    }
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row) }
  return rows
}

function norm(s: string) { return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') }
function pick(row: Record<string,string>, pats: RegExp[]) {
  for (const [k,v] of Object.entries(row)) if (pats.some(p => p.test(norm(k)))) return v
  return ''
}

export async function GET() {
  const response = await fetch(LANDSCAPE_URL, { cache: 'no-store', headers: { Accept: 'application/zip,*/*' } })
  if (!response.ok) return NextResponse.json({ error: 'CMS Landscape download failed', status: response.status }, { status: 502 })
  const zip = Buffer.from(await response.arrayBuffer())
  const entries = unzipTextEntries(zip)
  const csv = entries.find(e => /landscape.*\.csv$/i.test(e.name)) || entries.find(e => /\.csv$/i.test(e.name))
  if (!csv) return NextResponse.json({ error: 'No CSV found', entries: entries.map(e => e.name) }, { status: 500 })
  const rawRows = parseCsv(csv.text)
  const headers = rawRows[0] || []
  const objects = rawRows.slice(1).filter(r => r.some(Boolean)).map(values => Object.fromEntries(headers.map((h,i) => [h, values[i] || ''])))
  const stateKeys = headers.filter(h => /(^|_)state($|_)/i.test(norm(h)))
  const msRows = objects.filter(row => {
    const values = stateKeys.length ? stateKeys.map(k => row[k]) : Object.values(row)
    return values.some(v => /^(MS|Mississippi)$/i.test(String(v).trim()))
  })
  const wanted = msRows.filter(row => {
    const hay = Object.values(row).join(' ').toLowerCase()
    return /unitedhealth|united healthcare|aarp.*uhc|humana|devoted|aetna/.test(hay)
  })
  const concise = wanted.map(row => ({
    raw: row,
    contract_id: pick(row, [/contract/]),
    plan_id: pick(row, [/plan_id/, /^plan$/]),
    plan_name: pick(row, [/plan_name/, /plan_name_marketing/, /plan_marketing_name/]),
    organization: pick(row, [/organization/, /org_name/, /parent_organization/]),
    county: pick(row, [/county/]),
    state: pick(row, [/state/]),
    plan_type: pick(row, [/plan_type/]),
    premium: pick(row, [/monthly.*premium/, /part_c.*premium/, /plan.*premium/]),
    drug_deductible: pick(row, [/drug.*deduct/, /part_d.*deduct/]),
    moop: pick(row, [/moop/, /out.*of.*pocket/])
  }))
  return NextResponse.json({
    source: LANDSCAPE_URL,
    zip_bytes: zip.length,
    entries: entries.map(e => e.name),
    csv_file: csv.name,
    headers,
    total_rows: objects.length,
    ms_rows: msRows.length,
    wanted_rows: concise.length,
    rows: concise
  }, { headers: { 'Cache-Control': 'no-store' } })
}
