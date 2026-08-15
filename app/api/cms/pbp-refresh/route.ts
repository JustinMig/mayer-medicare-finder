import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CMS_PBP_2026_URL, collectPbpPlanObjects, downloadCmsPbpArchive, extractPbpBenefits, unzipJsonEntries } from '@/lib/cms-pbp'

export const runtime = 'nodejs'
export const maxDuration = 300

const DATASET_KEY = 'cms_pbp_2026_json'
const FRESH_DAYS = 30

type PlanRow = {
  id: string
  contract_id: string
  plan_id: string
  segment_id: string
  ambulance_copay: string | null
  emergency_room_copay: string | null
  urgent_care_copay: string | null
  inpatient_hospital: string | null
  benefit_details: Record<string, unknown> | null
}

function keyOf(plan: Pick<PlanRow, 'contract_id' | 'plan_id' | 'segment_id'>) {
  const segment = /^\d+$/.test(plan.segment_id || '') ? String(Number(plan.segment_id || '0')) : (plan.segment_id || '0')
  return `${plan.contract_id.toUpperCase()}-${String(plan.plan_id).padStart(3, '0')}-${segment}`
}

function fresh(value: string | null | undefined) {
  if (!value) return false
  return Date.now() - new Date(value).getTime() < FRESH_DAYS * 86400000
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let force = false
  try { force = Boolean((await request.json() as { force?: boolean }).force) } catch {}

  const admin = createAdminClient()
  const { data: state } = await admin.from('medicare_data_refresh_state').select('last_success_at, status, records_processed').eq('dataset_key', DATASET_KEY).maybeSingle()
  if (!force && fresh(state?.last_success_at)) {
    return NextResponse.json({ refreshed: false, fresh: true, records_processed: state?.records_processed || 0, last_success_at: state?.last_success_at, source_url: CMS_PBP_2026_URL })
  }

  const startedAt = new Date().toISOString()
  await admin.from('medicare_data_refresh_state').upsert({
    dataset_key: DATASET_KEY,
    source_url: CMS_PBP_2026_URL,
    source_year: 2026,
    last_attempt_at: startedAt,
    status: 'running',
    error_message: null,
    updated_at: startedAt
  }, { onConflict: 'dataset_key' })

  try {
    const { data: planData, error: planError } = await admin.from('medicare_plans').select('id, contract_id, plan_id, segment_id, ambulance_copay, emergency_room_copay, urgent_care_copay, inpatient_hospital, benefit_details').eq('plan_year', 2026)
    if (planError) throw new Error('Unable to load 2026 Medicare plans.')
    const plans = (planData || []) as PlanRow[]
    const targets = new Set(plans.map(keyOf))
    const archive = await downloadCmsPbpArchive()
    const entries = unzipJsonEntries(archive)
    if (!entries.length) throw new Error('The CMS PBP archive did not contain readable JSON files.')

    const matches = new Map<string, { raw: Record<string, unknown>; score: number; file: string }>()
    for (const entry of entries) {
      const found = collectPbpPlanObjects(entry.json, targets)
      for (const [key, candidate] of found) {
        const prior = matches.get(key)
        if (!prior || candidate.score > prior.score) matches.set(key, { ...candidate, file: entry.name })
      }
    }

    let processed = 0
    for (const plan of plans) {
      const key = keyOf(plan)
      const match = matches.get(key)
      if (!match) continue
      const extracted = extractPbpBenefits(match.raw)
      const serialized = JSON.stringify(match.raw)
      const rawForStorage = serialized.length <= 800000 ? match.raw : { raw_omitted_for_size: true, source_file: match.file, extracted }
      const existingDetails = plan.benefit_details || {}
      const cmsDetails = {
        ...existingDetails,
        cms_pbp_source: CMS_PBP_2026_URL,
        cms_pbp_source_file: match.file,
        cms_pbp_imported_at: startedAt,
        ...extracted
      }

      const update: Record<string, unknown> = {
        cms_pbp_raw: rawForStorage,
        cms_pbp_extracted: extracted,
        cms_pbp_source_url: CMS_PBP_2026_URL,
        cms_pbp_imported_at: startedAt,
        benefit_details: cmsDetails,
        structured_benefits_source: 'CMS PBP Benefits 2026 JSON',
        structured_benefits_verified_at: startedAt,
        updated_at: startedAt
      }
      if (!plan.ambulance_copay && extracted.ambulance_copay) update.ambulance_copay = extracted.ambulance_copay
      if (!plan.emergency_room_copay && extracted.emergency_room_copay) update.emergency_room_copay = extracted.emergency_room_copay
      if (!plan.urgent_care_copay && extracted.urgent_care_copay) update.urgent_care_copay = extracted.urgent_care_copay
      if (!plan.inpatient_hospital && extracted.inpatient_hospital) update.inpatient_hospital = extracted.inpatient_hospital

      const { error: updateError } = await admin.from('medicare_plans').update(update).eq('id', plan.id)
      if (!updateError) processed += 1
    }

    const completedAt = new Date().toISOString()
    await admin.from('medicare_data_refresh_state').upsert({
      dataset_key: DATASET_KEY,
      source_url: CMS_PBP_2026_URL,
      source_year: 2026,
      last_attempt_at: startedAt,
      last_success_at: completedAt,
      status: 'ready',
      records_processed: processed,
      error_message: null,
      details: { archive_bytes: archive.length, json_files: entries.map((entry) => entry.name), target_plans: plans.length, matched_plans: matches.size },
      updated_at: completedAt
    }, { onConflict: 'dataset_key' })

    return NextResponse.json({ refreshed: true, fresh: true, records_processed: processed, matched_plans: matches.size, target_plans: plans.length, source_url: CMS_PBP_2026_URL, completed_at: completedAt })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CMS PBP refresh failed.'
    await admin.from('medicare_data_refresh_state').upsert({
      dataset_key: DATASET_KEY,
      source_url: CMS_PBP_2026_URL,
      source_year: 2026,
      last_attempt_at: startedAt,
      status: 'error',
      error_message: message.slice(0, 1000),
      updated_at: new Date().toISOString()
    }, { onConflict: 'dataset_key' })
    return NextResponse.json({ error: message, source_url: CMS_PBP_2026_URL }, { status: 502 })
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await supabase.from('medicare_data_refresh_state').select('*').eq('dataset_key', DATASET_KEY).maybeSingle()
  return NextResponse.json({ state: data || null, source_url: CMS_PBP_2026_URL })
}
