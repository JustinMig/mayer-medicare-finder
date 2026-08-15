import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchQ1PlanDetails } from '@/lib/q1-medicare'
import { preloadFormularyDrugs } from '@/lib/formulary-preload'

type PlanRow = {
  id: string
  carrier: string
  plan_name: string
  contract_id: string
  plan_id: string
  q1_source_url: string | null
  formulary_source_url: string | null
}

type DrugRow = { id: string; rxcui: string; drug_name: string }
type ProgressRow = { medicare_plan_id: string; status: string; processed_count: number }

function fixedAndPercent(value: string | null) {
  if (!value) return { copay: null as number | null, coinsurance_percent: null as number | null }
  const fixed = value.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)/)
  const percent = value.match(/(\d+(?:\.\d+)?)\s*%/)
  return {
    copay: fixed ? Number(fixed[1]) : null,
    coinsurance_percent: percent ? Number(percent[1]) : null
  }
}

async function requireUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return data?.claims ? supabase : null
}

async function statusPayload() {
  const admin = createAdminClient()
  const [{ data: plans }, { data: drugs }, { data: progress }, { count: cachedPairs }] = await Promise.all([
    admin.from('medicare_plans').select('id').not('q1_source_url', 'is', null),
    admin.from('medicare_drug_catalog').select('id'),
    admin.from('medicare_formulary_preload_progress').select('medicare_plan_id,status,processed_count'),
    admin.from('medicare_plan_formulary').select('*', { count: 'exact', head: true })
  ])
  const totalPlans = plans?.length || 0
  const drugCount = drugs?.length || 0
  const rows = (progress || []) as ProgressRow[]
  const complete = rows.filter((row) => row.status === 'complete').length
  const partial = rows.filter((row) => row.status === 'partial').length
  const errors = rows.filter((row) => row.status === 'error').length
  const running = rows.filter((row) => row.status === 'running').length
  const attempted = complete + partial + errors
  return {
    total_plans: totalPlans,
    drug_count: drugCount,
    total_pairs: totalPlans * drugCount,
    cached_pairs: cachedPairs || 0,
    complete_plans: complete,
    partial_plans: partial,
    error_plans: errors,
    running_plans: running,
    attempted_plans: attempted,
    finished_cycle: totalPlans > 0 && attempted >= totalPlans && running === 0,
    fully_preloaded: totalPlans > 0 && complete === totalPlans
  }
}

export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await statusPayload(), { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()

  const [{ data: plansData }, { data: drugData }, { data: progressData }] = await Promise.all([
    admin.from('medicare_plans').select('id,carrier,plan_name,contract_id,plan_id,q1_source_url,formulary_source_url').not('q1_source_url', 'is', null).order('carrier').order('plan_name'),
    admin.from('medicare_drug_catalog').select('id,rxcui,drug_name').order('drug_name'),
    admin.from('medicare_formulary_preload_progress').select('medicare_plan_id,status')
  ])

  const plans = (plansData || []) as PlanRow[]
  const drugs = (drugData || []) as DrugRow[]
  const attempted = new Set((progressData || []).filter((row) => ['complete','partial','error'].includes(row.status)).map((row) => row.medicare_plan_id))
  const plan = plans.find((item) => !attempted.has(item.id))
  if (!plan) return NextResponse.json({ ...(await statusPayload()), message: 'Formulary preload cycle finished.' })

  const started = new Date().toISOString()
  await admin.from('medicare_formulary_preload_progress').upsert({
    medicare_plan_id: plan.id,
    status: 'running',
    drug_count: drugs.length,
    processed_count: 0,
    covered_count: 0,
    unavailable_count: 0,
    last_error: null,
    started_at: started,
    completed_at: null,
    updated_at: started
  }, { onConflict: 'medicare_plan_id' })

  try {
    let formularyUrl = plan.formulary_source_url
    if (!formularyUrl && plan.q1_source_url) {
      const details = await fetchQ1PlanDetails(plan.q1_source_url)
      formularyUrl = details?.formulary_url || null
      if (formularyUrl) {
        await admin.from('medicare_plans').update({ formulary_source_url: formularyUrl, updated_at: new Date().toISOString() }).eq('id', plan.id)
      }
    }
    if (!formularyUrl) throw new Error('No formulary source URL was available for this plan.')

    const matches = await preloadFormularyDrugs(formularyUrl, drugs)
    const available = matches.filter((match) => match.source_available)
    const unavailableCount = matches.length - available.length
    const formularyRows = available.map((match) => ({
      medicare_plan_id: plan.id,
      drug_id: match.id,
      tier: match.tier,
      covered: match.covered,
      prior_authorization: /\bP\b|prior authorization/i.test(match.utilization_management || ''),
      step_therapy: /\bS\b|step therapy/i.test(match.utilization_management || ''),
      quantity_limit: /\bQ\b|quantity/i.test(match.utilization_management || ''),
      source: 'Preloaded Q1Medicare formulary browser (CMS-derived reference)',
      source_date: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString()
    }))
    if (formularyRows.length) await admin.from('medicare_plan_formulary').upsert(formularyRows, { onConflict: 'medicare_plan_id,drug_id' })

    const shareMap = new Map<string, Record<string, unknown>>()
    for (const match of available.filter((item) => item.covered && item.tier)) {
      if (match.preferred_30_day) {
        const parsed = fixedAndPercent(match.preferred_30_day)
        shareMap.set(`${match.tier}|preferred_retail|30`, { medicare_plan_id: plan.id, tier: match.tier, pharmacy_type: 'preferred_retail', days_supply: 30, ...parsed, source: 'Preloaded Q1Medicare formulary browser (CMS-derived reference)', source_date: new Date().toISOString().slice(0,10), updated_at: new Date().toISOString() })
      }
      if (match.mail_90_day) {
        const parsed = fixedAndPercent(match.mail_90_day)
        shareMap.set(`${match.tier}|mail_order|90`, { medicare_plan_id: plan.id, tier: match.tier, pharmacy_type: 'mail_order', days_supply: 90, ...parsed, source: 'Preloaded Q1Medicare formulary browser (CMS-derived reference)', source_date: new Date().toISOString().slice(0,10), updated_at: new Date().toISOString() })
      }
    }
    if (shareMap.size) await admin.from('medicare_plan_drug_cost_shares').upsert([...shareMap.values()], { onConflict: 'medicare_plan_id,tier,pharmacy_type,days_supply' })

    const completedAt = new Date().toISOString()
    await admin.from('medicare_formulary_preload_progress').update({
      status: unavailableCount ? 'partial' : 'complete',
      processed_count: available.length,
      covered_count: available.filter((match) => match.covered).length,
      unavailable_count: unavailableCount,
      completed_at: completedAt,
      updated_at: completedAt
    }).eq('medicare_plan_id', plan.id)

    return NextResponse.json({
      ...(await statusPayload()),
      processed_plan: `${plan.carrier} · ${plan.plan_name}`,
      processed_drugs: available.length,
      unavailable_drugs: unavailableCount
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Formulary preload failed.'
    const completedAt = new Date().toISOString()
    await admin.from('medicare_formulary_preload_progress').update({ status: 'error', last_error: message.slice(0,500), completed_at: completedAt, updated_at: completedAt }).eq('medicare_plan_id', plan.id)
    return NextResponse.json({ ...(await statusPayload()), processed_plan: `${plan.carrier} · ${plan.plan_name}`, warning: message }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
}
