import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const NPPES_URL = 'https://npiregistry.cms.hhs.gov/api/'
const ZIP_API_BASE = 'https://api.zippopotam.us/us/'
const ALLOWED_RADII = new Set([5, 10, 25, 50, 100])

type Address = { address_purpose?: string; address_1?: string; address_2?: string; city?: string; state?: string; postal_code?: string; telephone_number?: string }
type Taxonomy = { desc?: string; primary?: boolean }
type NppesResult = { number?: string; basic?: { organization_name?: string; status?: string }; addresses?: Address[]; practiceLocations?: Address[]; taxonomies?: Taxonomy[] }
type NppesResponse = { results?: NppesResult[] }
type Coordinates = { lat: number; lon: number }

type PharmacyCandidate = {
  npi: string
  location_key: string
  name: string
  address: string
  city: string
  state: string
  postal_code: string
  phone: string | null
  specialty: string | null
}

function cleanZip(value: string) { return value.trim().match(/^(\d{5})/)?.[1] || '' }
function cleanQuery(value: string) { return value.replace(/[^a-zA-Z0-9'&.\-\s]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) }
function norm(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() }
function locationKey(npi: string, address: string, city: string, zip: string) { return [npi, norm(address), norm(city), zip].join('|') }
function isPharmacy(result: NppesResult) { return (result.taxonomies || []).some((taxonomy) => /pharmacy|pharmacist/i.test(taxonomy.desc || '')) }
function haversineMiles(a: Coordinates, b: Coordinates) {
  const r = 3958.7613
  const rad = (d: number) => d * Math.PI / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}

async function coordinatesForZips(zips: string[], supabase: Awaited<ReturnType<typeof createClient>>) {
  const unique = [...new Set(zips.map(cleanZip).filter(Boolean))]
  const map = new Map<string, Coordinates>()
  if (!unique.length) return map

  const { data } = await supabase.from('zip_coordinates').select('zip_code, lat, lon').in('zip_code', unique)
  for (const row of data || []) {
    const lat = Number(row.lat); const lon = Number(row.lon)
    if (Number.isFinite(lat) && Number.isFinite(lon)) map.set(row.zip_code, { lat, lon })
  }

  const misses = unique.filter((zip) => !map.has(zip)).slice(0, 60)
  const fetched = await Promise.allSettled(misses.map(async (zip) => {
    const response = await fetch(`${ZIP_API_BASE}${zip}`, { headers: { Accept: 'application/json' }, next: { revalidate: 60 * 60 * 24 * 30 } })
    if (!response.ok) return null
    const body = await response.json() as { places?: Array<{ latitude?: string; longitude?: string }> }
    const lat = Number(body.places?.[0]?.latitude); const lon = Number(body.places?.[0]?.longitude)
    return Number.isFinite(lat) && Number.isFinite(lon) ? { zip, lat, lon } : null
  }))

  const rows: Array<{ zip_code: string; lat: number; lon: number; source: string; updated_at: string }> = []
  for (const item of fetched) {
    if (item.status !== 'fulfilled' || !item.value) continue
    map.set(item.value.zip, { lat: item.value.lat, lon: item.value.lon })
    rows.push({ zip_code: item.value.zip, lat: item.value.lat, lon: item.value.lon, source: 'zippopotam.us', updated_at: new Date().toISOString() })
  }
  if (rows.length) {
    try { await createAdminClient().from('zip_coordinates').upsert(rows, { onConflict: 'zip_code' }) } catch {}
  }
  return map
}

function candidates(result: NppesResult): PharmacyCandidate[] {
  if (!result.number || result.basic?.status === 'D' || !result.basic?.organization_name || !isPharmacy(result)) return []
  const specialty = (result.taxonomies || []).find((taxonomy) => taxonomy.primary)?.desc || result.taxonomies?.[0]?.desc || null
  const locations = [
    ...(result.addresses || []).filter((address) => address.address_purpose === 'LOCATION'),
    ...(result.practiceLocations || [])
  ]
  const out = new Map<string, PharmacyCandidate>()
  for (const location of locations) {
    if ((location.state || '').toUpperCase() !== 'MS') continue
    const postal = cleanZip(location.postal_code || '')
    if (!postal) continue
    const address = [location.address_1, location.address_2].filter(Boolean).join(', ').trim()
    const city = location.city?.trim() || ''
    const key = locationKey(result.number, address, city, postal)
    out.set(key, {
      npi: result.number,
      location_key: key,
      name: result.basic.organization_name.trim(),
      address,
      city,
      state: 'MS',
      postal_code: postal,
      phone: location.telephone_number?.trim() || null,
      specialty
    })
  }
  return [...out.values()]
}

async function searchNppes(query: string) {
  const params = new URLSearchParams({
    version: '2.1', enumeration_type: 'NPI-2', address_purpose: 'LOCATION', state: 'MS', limit: '60', organization_name: `${query}*`
  })
  const response = await fetch(`${NPPES_URL}?${params.toString()}`, { headers: { Accept: 'application/json' }, next: { revalidate: 60 * 60 * 6 } })
  if (!response.ok) throw new Error(`NPPES ${response.status}`)
  return (await response.json() as NppesResponse).results || []
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const query = cleanQuery(request.nextUrl.searchParams.get('q') || '')
  const zip = cleanZip(request.nextUrl.searchParams.get('zip') || '')
  const radius = Number(request.nextUrl.searchParams.get('radius') || '25')
  if (query.length < 2) return NextResponse.json({ error: 'Type at least 2 letters of the pharmacy name.' }, { status: 400 })
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: 'Enter a valid 5-digit ZIP code.' }, { status: 400 })
  if (!ALLOWED_RADII.has(radius)) return NextResponse.json({ error: 'Choose a valid radius.' }, { status: 400 })

  try {
    const raw = (await searchNppes(query)).flatMap(candidates)
    const coordinateMap = await coordinatesForZips([zip, ...raw.map((item) => item.postal_code)], supabase)
    const center = coordinateMap.get(zip)
    if (!center) return NextResponse.json({ error: 'ZIP code could not be located.' }, { status: 400 })

    const results = raw.map((item) => {
      const point = coordinateMap.get(item.postal_code)
      if (!point) return null
      const distance = Math.round(haversineMiles(center, point) * 10) / 10
      return distance <= radius ? { ...item, distance_miles: distance } : null
    }).filter((item): item is PharmacyCandidate & { distance_miles: number } => Boolean(item))
      .sort((a, b) => a.distance_miles - b.distance_miles || a.name.localeCompare(b.name))
      .slice(0, 30)

    if (results.length) {
      try {
        const admin = createAdminClient()
        await admin.from('medicare_pharmacies').upsert(results.map((item) => ({
          npi: item.npi,
          location_key: item.location_key,
          organization_name: item.name,
          address_line1: item.address,
          city: item.city,
          state: item.state,
          zip_code: item.postal_code,
          phone: item.phone,
          source: 'CMS NPPES NPI Registry API 2.1',
          source_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })), { onConflict: 'location_key' })
        const { data: ids } = await admin.from('medicare_pharmacies').select('id, location_key').in('location_key', results.map((item) => item.location_key))
        const idMap = new Map((ids || []).map((row) => [row.location_key, row.id]))
        return NextResponse.json({ results: results.map((item) => ({ ...item, id: idMap.get(item.location_key) || null })), count: results.length, source: 'CMS NPPES NPI Registry API 2.1' }, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } })
      } catch {}
    }

    return NextResponse.json({ results, count: results.length, source: 'CMS NPPES NPI Registry API 2.1' }, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } })
  } catch {
    return NextResponse.json({ error: 'Unable to search the CMS pharmacy directory right now.' }, { status: 502 })
  }
}
