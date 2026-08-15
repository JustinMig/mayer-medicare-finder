import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type DocumentType = 'summary' | 'eoc'

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
}

function absoluteUrl(value: string) {
  try { return new URL(decodeHtml(value), 'https://www.medicareadvantage.com').toString() } catch { return null }
}

async function findPlanPage(contractId: string, planId: string, segmentId: string) {
  const key = `${contractId}-${planId}-${segmentId.padStart(3, '0')}`.toLowerCase()
  const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; MayerMedicareFinder/1.0)' }
  const root = await fetch('https://www.medicareadvantage.com/sitemap.xml', { headers, next: { revalidate: 86400 } })
  if (!root.ok) return null
  const xml = await root.text()
  const rootUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => decodeHtml(m[1]))
  const direct = rootUrls.find((url) => url.toLowerCase().includes('/plans/') && url.toLowerCase().includes(key))
  if (direct) return direct

  const maps = rootUrls.filter((url) => /sitemap/i.test(url)).slice(0, 30)
  for (const map of maps) {
    try {
      const response = await fetch(map, { headers, next: { revalidate: 86400 } })
      if (!response.ok) continue
      const body = await response.text()
      const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => decodeHtml(m[1]))
      const match = urls.find((url) => url.toLowerCase().includes('/plans/') && url.toLowerCase().includes(key))
      if (match) return match
    } catch { /* try next sitemap */ }
  }
  return null
}

async function findDocumentUrl(planPage: string, type: DocumentType) {
  const response = await fetch(planPage, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MayerMedicareFinder/1.0)' }, next: { revalidate: 86400 } })
  if (!response.ok) return null
  const html = await response.text()
  const label = type === 'summary' ? /summary\s+of\s+benefits/i : /evidence\s+of\s+coverage/i
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  for (const match of anchors) {
    const text = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (label.test(text)) {
      const url = absoluteUrl(match[1])
      if (url) return url
    }
  }
  return null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = request.nextUrl.searchParams.get('id') || ''
  const type = request.nextUrl.searchParams.get('type') as DocumentType
  if (!id || !['summary', 'eoc'].includes(type)) return NextResponse.json({ error: 'Invalid document request' }, { status: 400 })

  const { data: plan, error } = await supabase.from('medicare_plans').select('contract_id,plan_id,segment_id,summary_benefits_url,evidence_of_coverage_url,q1_source_url').eq('id', id).eq('commissionable', true).maybeSingle()
  if (error || !plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  const cached = type === 'summary' ? plan.summary_benefits_url : plan.evidence_of_coverage_url
  if (cached) return NextResponse.redirect(cached)

  try {
    const page = await findPlanPage(plan.contract_id, plan.plan_id, plan.segment_id || '0')
    const documentUrl = page ? await findDocumentUrl(page, type) : null
    if (documentUrl) {
      // Best-effort cache. If RLS prevents this update, the redirect still works.
      const field = type === 'summary' ? 'summary_benefits_url' : 'evidence_of_coverage_url'
      await supabase.from('medicare_plans').update({ [field]: documentUrl }).eq('id', id)
      return NextResponse.redirect(documentUrl)
    }
  } catch { /* use reference fallback below */ }

  if (plan.q1_source_url) return NextResponse.redirect(plan.q1_source_url)
  return NextResponse.json({ error: 'Plan document link is not available yet.' }, { status: 404 })
}
