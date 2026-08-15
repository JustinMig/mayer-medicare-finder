import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { costShareAmount, deductibleInfo, fetchQ1DrugMatch, fetchQ1PlanDetails, type Q1DrugMatch, type Q1PlanDetails } from '@/lib/q1-medicare'

const PART_B_STANDARD_PREMIUM_2026 = 202.90
const PART_D_OOP_CAP_2026 = 2100
const MAX_PLANS = 4
const MAX_DRUGS = 10

type DrugInput = { rxcui: string; name: string }
type PlanRow = {
  id: string
  carrier: string
  plan_name: string
  contract_id: string
  plan_id: string
  segment_id: string
  monthly_premium: string | null
  q1_source_url: string | null
  ambulance_copay: string | null
  emergency_room_copay: string | null
  urgent_care_copay: string | null
  drug_deductible: string | null
  drug_oop_cap: string | null
  formulary_source_url: string | null
  structured_benefits_verified_at: string | null
  benefit_details: Record<string, unknown> | null
}

type PlanDrugResult = DrugInput & Q1DrugMatch & {
  estimated_fill_cost: number | null
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function numericMoney(value: string | null | undefined) {
  if (!value) return null
  const match = value.replace(/,/g, '').match(/\$?(-?\d+(?:\.\d+)?)/)
  const amount = Number(match?.[1])
  return Number.isFinite(amount) ? amount : null
}

function detailString(details: Record<string, unknown> | null, key: string) {
  const value = details?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isFresh(value: string | null, days = 30) {
  if (!value) return false
  return Date.now() - new Date(value).getTime() < days * 86400000
}

async function settleWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length)
  let cursor = 0
  async function run() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      output[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => run()))
  return output
}

async function loadPlanDetails(plan: PlanRow) {
  const cached: Q1PlanDetails = {
    ambulance_copay: plan.ambulance_copay,
    emergency_room_copay: plan.emergency_room_copay,
    urgent_care_copay: plan.urgent_care_copay,
    drug_deductible: plan.drug_deductible,
    part_b_credit: detailString(plan.benefit_details, 'part_b_credit_monthly'),
    formulary_url: plan.formulary_source_url
  }

  if (isFresh(plan.structured_benefits_verified_at) && cached.formulary_url) return cached
  if (!plan.q1_source_url) return cached

  const live = await fetchQ1PlanDetails(plan.q1_source_url)
  if (!live) return cached
  const merged: Q1PlanDetails = {
    ambulance_copay: live.ambulance_copay || cached.ambulance_copay,
    emergency_room_copay: live.emergency_room_copay || cached.emergency_room_copay,
    urgent_care_copay: live.urgent_care_copay || cached.urgent_care_copay,
    drug_deductible: live.drug_deductible || cached.drug_deductible,
    part_b_credit: live.part_b_credit || cached.part_b_credit,
    formulary_url: live.formulary_url || cached.formulary_url
  }

  try {
    const admin = createAdminClient()
    await admin.from('medicare_plans').update({
      ambulance_copay: merged.ambulance_copay,
      emergency_room_copay: merged.emergency_room_copay,
      urgent_care_copay: merged.urgent_care_copay,
      drug_deductible: merged.drug_deductible,
      drug_oop_cap: `$${PART_D_OOP_CAP_2026.toLocaleString('en-US')} / year for covered Part D drugs`,
      formulary_source_url: merged.formulary_url,
      structured_benefits_source: 'Q1Medicare 2026 plan detail (CMS-derived reference)',
      structured_benefits_verified_at: new Date().toISOString()
    }).eq('id', plan.id)
  } catch {
    // Comparison remains usable if the server cache cannot be updated.
  }
  return merged
}

function simulateYear(drugs: PlanDrugResult[], deductibleText: string | null) {
  const deductible = deductibleInfo(deductibleText)
  let deductibleRemaining = deductible.amount
  let cumulative = 0
  let hasUnknownCost = false
  const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, cost: 0, unknown_drugs: 0 }))

  for (const month of months) {
    for (const drug of drugs) {
      if (!drug.covered || !drug.source_available) {
        if (drug.source_available && !drug.covered) continue
        month.unknown_drugs += 1
        hasUnknownCost = true
        continue
      }

      const tier = Number(drug.tier)
      const retail = drug.retail_30_day
      const normalShare = drug.estimated_fill_cost
      let fillCost: number | null = normalShare

      if (deductibleRemaining > 0 && Number.isFinite(tier) && !deductible.excluded_tiers.has(tier) && retail !== null) {
        const deductiblePiece = Math.min(deductibleRemaining, retail)
        deductibleRemaining -= deductiblePiece
        if (deductiblePiece >= retail) fillCost = retail
        else if (normalShare !== null && retail > 0) fillCost = deductiblePiece + normalShare * ((retail - deductiblePiece) / retail)
        else fillCost = null
      }

      if (fillCost === null) {
        month.unknown_drugs += 1
        hasUnknownCost = true
        continue
      }

      const roomUnderCap = Math.max(0, PART_D_OOP_CAP_2026 - cumulative)
      const applied = Math.min(fillCost, roomUnderCap)
      month.cost += applied
      cumulative += applied
    }
    month.cost = Number(month.cost.toFixed(2))
  }

  return {
    deductible_amount: deductible.amount,
    deductible_excluded_tiers: [...deductible.excluded_tiers].sort((a, b) => a - b),
    months,
    annual_drug_cost: Number(cumulative.toFixed(2)),
    has_unknown_cost: hasUnknownCost,
    reached_part_d_cap: cumulative >= PART_D_OOP_CAP_2026
  }
}

async function persistDrugCache(plan: PlanRow, drug: DrugInput, match: Q1DrugMatch) {
  if (!match.source_available) return
  try {
    const admin = createAdminClient()
    const { data: catalogData } = await admin.from('medicare_drug_catalog').upsert({
      rxcui: drug.rxcui,
      drug_name: drug.name,
      display_name: drug.name,
      source: 'NLM RxNorm',
      updated_at: new Date().toISOString()
    }, { onConflict: 'rxcui' }).select('id').single()
    if (!catalogData?.id) return

    await admin.from('medicare_plan_formulary').upsert({
      medicare_plan_id: plan.id,
      drug_id: catalogData.id,
      tier: match.tier,
      covered: match.covered,
      prior_authorization: /\bP\b|prior authorization/i.test(match.utilization_management || ''),
      step_therapy: /\bS\b|step therapy/i.test(match.utilization_management || ''),
      quantity_limit: /\bQ\b|quantity/i.test(match.utilization_management || ''),
      source: 'Q1Medicare formulary browser (CMS-derived reference)',
      source_date: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString()
    }, { onConflict: 'medicare_plan_id,drug_id' })

    if (match.covered && match.tier && match.preferred_30_day) {
      const fixed = numericMoney(match.preferred_30_day)
      const percent = match.preferred_30_day.match(/(\d+(?:\.\d+)?)\s*%/)
      await admin.from('medicare_plan_drug_cost_shares').upsert({
        medicare_plan_id: plan.id,
        tier: match.tier,
        pharmacy_type: 'preferred_retail',
        days_supply: 30,
        copay: fixed,
        coinsurance_percent: percent ? Number(percent[1]) : null,
        source: 'Q1Medicare formulary browser (CMS-derived reference)',
        source_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString()
      }, { onConflict: 'medicare_plan_id,tier,pharmacy_type,days_supply' })
    }

    if (match.covered && match.retail_30_day !== null) {
      await admin.from('medicare_plan_drug_pricing').upsert({
        medicare_plan_id: plan.id,
        drug_id: catalogData.id,
        pharmacy_type: 'preferred_retail',
        days_supply: 30,
        average_monthly_cost: match.retail_30_day,
        source: 'Q1Medicare negotiated retail reference (CMS-derived)',
        source_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString()
      }, { onConflict: 'medicare_plan_id,drug_id,pharmacy_type,days_supply' })
    }
  } catch {
    // Persistence is an optimization only; live results are still returned.
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { plan_ids?: string[]; drugs?: DrugInput[]; medicaid?: string }
  try { body = await request.json() as typeof body } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }

  const planIds = [...new Set((body.plan_ids || []).filter(Boolean))].slice(0, MAX_PLANS)
  const drugs = (body.drugs || [])
    .filter((drug) => drug?.rxcui && drug?.name)
    .map((drug) => ({ rxcui: String(drug.rxcui).slice(0, 30), name: String(drug.name).slice(0, 140) }))
    .filter((drug, index, all) => all.findIndex((item) => item.rxcui === drug.rxcui) === index)
    .slice(0, MAX_DRUGS)

  if (!planIds.length) return NextResponse.json({ plans: {}, part_b_standard_premium: PART_B_STANDARD_PREMIUM_2026, part_d_oop_cap: PART_D_OOP_CAP_2026 })

  const { data: planData, error } = await supabase.from('medicare_plans').select(`
    id, carrier, plan_name, contract_id, plan_id, segment_id, monthly_premium,
    q1_source_url, ambulance_copay, emergency_room_copay, urgent_care_copay,
    drug_deductible, drug_oop_cap, formulary_source_url, structured_benefits_verified_at, benefit_details
  `).in('id', planIds)
  if (error) return NextResponse.json({ error: 'Unable to load plans for comparison.' }, { status: 500 })

  const plans = (planData || []) as PlanRow[]
  const details = await settleWithConcurrency(plans, 3, async (plan) => ({ plan, details: await loadPlanDetails(plan) }))
  const responsePlans: Record<string, unknown> = {}

  for (const { plan, details: planDetails } of details) {
    const drugMatches = drugs.length && planDetails.formulary_url
      ? await settleWithConcurrency(drugs, 4, async (drug) => {
          const match = await fetchQ1DrugMatch(planDetails.formulary_url as string, drug.name)
          const estimated = costShareAmount(match.preferred_30_day, match.retail_30_day)
          void persistDrugCache(plan, drug, match)
          return { ...drug, ...match, estimated_fill_cost: estimated } satisfies PlanDrugResult
        })
      : drugs.map((drug) => ({
          ...drug,
          covered: false,
          source_available: false,
          drug_name: drug.name,
          tier: null,
          tier_description: null,
          preferred_30_day: null,
          mail_90_day: null,
          utilization_management: null,
          retail_30_day: null,
          retail_90_day: null,
          source_url: null,
          estimated_fill_cost: null
        } satisfies PlanDrugResult))

    const year = simulateYear(drugMatches, planDetails.drug_deductible)
    const monthlyPremium = numericMoney(plan.monthly_premium) || 0
    const credit = numericMoney(planDetails.part_b_credit) || numericMoney(detailString(plan.benefit_details, 'part_b_credit_monthly')) || 0
    const netPartB = Math.max(0, PART_B_STANDARD_PREMIUM_2026 - credit)
    const allCovered = drugs.length > 0 && drugMatches.every((drug) => drug.covered)
    const anyUnavailable = drugMatches.some((drug) => !drug.source_available)
    const annualPlanPremium = monthlyPremium * 12
    const annualPartB = netPartB * 12
    const annualTotal = Number((annualPlanPremium + annualPartB + year.annual_drug_cost).toFixed(2))

    responsePlans[plan.id] = {
      plan_id: plan.id,
      ambulance_copay: planDetails.ambulance_copay,
      emergency_room_copay: planDetails.emergency_room_copay,
      urgent_care_copay: planDetails.urgent_care_copay,
      drug_deductible: planDetails.drug_deductible,
      drug_oop_cap: `$${PART_D_OOP_CAP_2026.toLocaleString('en-US')} / year for covered Part D drugs`,
      part_b_standard_premium: PART_B_STANDARD_PREMIUM_2026,
      part_b_giveback: credit,
      part_b_net_standard_premium: Number(netPartB.toFixed(2)),
      drugs: drugMatches,
      covers_all_medications: allCovered,
      medication_source_unavailable: anyUnavailable,
      monthly_drug_breakdown: year.months,
      estimated_annual_drug_cost: year.annual_drug_cost,
      estimated_annual_plan_premium: Number(annualPlanPremium.toFixed(2)),
      estimated_annual_standard_part_b: Number(annualPartB.toFixed(2)),
      estimated_annual_total_standard_part_b_plus_plan_plus_drugs: annualTotal,
      drug_cost_has_unknowns: year.has_unknown_cost,
      deductible_amount: year.deductible_amount,
      deductible_excluded_tiers: year.deductible_excluded_tiers,
      reached_part_d_cap: year.reached_part_d_cap,
      source: 'CMS plan data + Q1Medicare CMS-derived benefit/formulary reference + NLM RxNorm'
    }
  }

  return NextResponse.json({
    plans: responsePlans,
    part_b_standard_premium: PART_B_STANDARD_PREMIUM_2026,
    part_d_oop_cap: PART_D_OOP_CAP_2026,
    medication_count: drugs.length,
    estimate_note: 'Medication costs are estimates using published formulary tier cost sharing and negotiated retail reference prices. Pharmacy choice, fill quantity, LIS/Extra Help, plan changes, and real-time pharmacy pricing can change actual costs.',
    lis_note: body.medicaid && body.medicaid !== 'none' ? 'The selected Medicaid/MSP level may qualify the beneficiary for Extra Help, so actual prescription copays may be lower than the standard cost estimate shown.' : null
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
