import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type RxConcept = { rxcui?: string; name?: string; synonym?: string; tty?: string }
type RxGroup = { conceptProperties?: RxConcept[] }
type RxDrugsPayload = { drugGroup?: { conceptGroup?: RxGroup[] } }
type ApproxPayload = { approximateGroup?: { candidate?: Array<{ rxcui?: string; name?: string; score?: string; rank?: string }> } }

function cleanQuery(value: string) {
  return value.replace(/[^a-zA-Z0-9%./+\-\s]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

async function fetchJson(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal, next: { revalidate: 60 * 60 * 24 } })
    if (!response.ok) return null
    return await response.json() as unknown
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = cleanQuery(request.nextUrl.searchParams.get('q') || '')
  if (q.length < 2) return NextResponse.json({ results: [] })

  const direct = await fetchJson(`https://rxnav.nlm.nih.gov/REST/Prescribe/drugs.json?name=${encodeURIComponent(q)}`) as RxDrugsPayload | null
  const concepts = (direct?.drugGroup?.conceptGroup || []).flatMap((group) => group.conceptProperties || [])

  let candidates = concepts
    .filter((item): item is Required<Pick<RxConcept, 'rxcui' | 'name'>> & RxConcept => Boolean(item.rxcui && item.name))
    .map((item) => ({ rxcui: item.rxcui, name: item.name, synonym: item.synonym || null, tty: item.tty || null }))

  if (!candidates.length) {
    const approximate = await fetchJson(`https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=12&option=1`) as ApproxPayload | null
    candidates = (approximate?.approximateGroup?.candidate || [])
      .filter((item): item is { rxcui: string; name: string; score?: string; rank?: string } => Boolean(item.rxcui && item.name))
      .map((item) => ({ rxcui: item.rxcui, name: item.name, synonym: null, tty: null }))
  }

  const seen = new Set<string>()
  const results = candidates.filter((item) => {
    if (seen.has(item.rxcui)) return false
    seen.add(item.rxcui)
    return true
  }).slice(0, 16)

  if (results.length) {
    try {
      const admin = createAdminClient()
      await admin.from('medicare_drug_catalog').upsert(
        results.map((item) => ({
          rxcui: item.rxcui,
          drug_name: item.name,
          display_name: item.name,
          source: 'NLM RxNorm',
          updated_at: new Date().toISOString()
        })),
        { onConflict: 'rxcui' }
      )
    } catch {
      // Medication search stays available even if the server-side reference cache cannot be updated.
    }
  }

  return NextResponse.json({
    results,
    source: 'NLM RxNorm',
    disclaimer: 'Medication names are normalized with the U.S. National Library of Medicine RxNorm service.'
  }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
}
