import { NextResponse } from 'next/server'
import { inflateRawSync } from 'node:zlib'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CMS_ZIP = 'https://www.cms.gov/files/zip/cy-2026-agent-broker-compensation-data.zip'

type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; localOffset: number }

function findEocd(buf: Buffer) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i
  }
  throw new Error('ZIP EOCD not found')
}

function listEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf)
  const totalEntries = buf.readUInt16LE(eocd + 10)
  const centralOffset = buf.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []
  let p = centralOffset
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error(`Bad central directory signature at ${p}`)
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const uncompressedSize = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function extractEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const p = entry.localOffset
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`Bad local header for ${entry.name}`)
  const nameLen = buf.readUInt16LE(p + 26)
  const extraLen = buf.readUInt16LE(p + 28)
  const start = p + 30 + nameLen + extraLen
  const compressed = buf.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return Buffer.from(compressed)
  if (entry.method === 8) return inflateRawSync(compressed)
  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}`)
}

export async function GET() {
  try {
    const response = await fetch(CMS_ZIP, { cache: 'no-store', headers: { 'User-Agent': 'MayerMedicareFinder/1.0' } })
    if (!response.ok) return NextResponse.json({ error: `CMS fetch failed: ${response.status}` }, { status: 502 })
    const zip = Buffer.from(await response.arrayBuffer())
    const entries = listEntries(zip)
    const textEntry = entries.find((e) => /\.(csv|txt)$/i.test(e.name))
    if (!textEntry) return NextResponse.json({ size: zip.length, entries: entries.map(({ name, method, uncompressedSize }) => ({ name, method, uncompressedSize })) })
    const text = extractEntry(zip, textEntry).toString('utf8')
    return new NextResponse(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
