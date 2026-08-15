import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { costShareAmount, deductibleInfo, fetchQ1DrugMatch, fetchQ1PlanDetails, type Q1DrugMatch, type Q1PlanDetails } from '@/lib/q1-medicare'

const PART_B_STANDARD_PREMIUM_2026 = 202.90
const PART_D_OOP_CAP_2026 = 2100
const MAX_PLANS = 4
const MAX_DRUGS = 10
const ALLOWED_DAYS = new Set([30, 60, 90])
const PRICING_BASES = new Set(['auto', 'preferred_retail', 'standard_retail', 'mail_order'])

type DrugInput = { rxcui: string; name: string; quantity: number; days_supply: 30 | 60 | 90 }
type PharmacyInput = { id?: string | null; npi: string; name: string; location_key?: string | null; address?: string; city?: string; state?: string; postal_code?: string }
type PricingBasis = 'auto' | 'preferred_retail' | 'standard_retail' | 'mail_order'
type PlanRow = {
  id: string; carrier: string; plan_name: string; contract_id: string; plan_id: string; segment_id: string; monthly_premium: string | null; q1_source_url: string | null
  ambulance_copay: string | null; emergency_room_copay: string | null; urgent_care_copay: string | null; drug_deductible: string | null; drug_oop_cap: string | null
  formulary_source_url: string | null; structured_benefits_verified_at: string | null; benefit_details: Record<string, unknown> | null
}
type PlanDrugResult = DrugInput & Q1DrugMatch & {
  requested_quantity: number
  requested_days_supply: number
  estimated_fill_cost: number | null
  fill_months: number[]
  pricing_basis: Exclude<PricingBasis, 'auto'>
  pricing_basis_source: 'cms_pharmacy_network' | 'user_selected' | 'preferred_estimate'
}
type PharmacyNetworkRow = { medicare_plan_id: string; in_network: boolean | null; preferred: boolean | null; retail: boolean | null; mail_order: boolean | null; source: string | null; source_date: string | null; verified_at: string | null }

function numericMoney(value: string | null | undefined) { if (!value) return null; const match = value.replace(/,/g, '').match(/\$?(-?\d+(?:\.\d+)?)/); const amount = Number(match?.[1]); return Number.isFinite(amount) ? amount : null }
function detailString(details: Record<string, unknown> | null, key: string) { const value = details?.[key]; return typeof value === 'string' && value.trim() ? value.trim() : null }
function isFresh(value: string | null, days = 30) { return Boolean(value) && Date.now() - new Date(value as string).getTime() < days * 86400000 }
function fillMonths(daysSupply: number) { return daysSupply === 90 ? [1, 4, 7, 10] : daysSupply === 60 ? [1, 3, 5, 7, 9, 11] : [1,2,3,4,5,6,7,8,9,10,11,12] }

async function settleWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length); let cursor = 0
  async function run() { while (true) { const index = cursor++; if (index >= items.length) return; output[index] = await worker(items[index]) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => run())); return output
}

async function loadPlanDetails(plan: PlanRow) {
  const cached: Q1PlanDetails = { ambulance_copay: plan.ambulance_copay, emergency_room_copay: plan.emergency_room_copay, urgent_care_copay: plan.urgent_care_copay, drug_deductible: plan.drug_deductible, part_b_credit: detailString(plan.benefit_details, 'part_b_credit_monthly'), formulary_url: plan.formulary_source_url }
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
    await createAdminClient().from('medicare_plans').update({ ambulance_copay: merged.ambulance_copay, emergency_room_copay: merged.emergency_room_copay, urgent_care_copay: merged.urgent_care_copay, drug_deductible: merged.drug_deductible, drug_oop_cap: `$${PART_D_OOP_CAP_2026.toLocaleString('en-US')} / year for covered Part D drugs`, formulary_source_url: merged.formulary_url, structured_benefits_verified_at: new Date().toISOString() }).eq('id', plan.id)
  } catch {}
  return merged
}

function pharmacyBasis(requested: PricingBasis, network: PharmacyNetworkRow | undefined): { basis: Exclude<PricingBasis, 'auto'>; source: PlanDrugResult['pricing_basis_source'] } {
  if (requested !== 'auto') return { basis: requested, source: 'user_selected' }
  if (network?.preferred && network?.retail !== false) return { basis: 'preferred_retail', source: 'cms_pharmacy_network' }
  if (network?.in_network && network?.mail_order && network?.retail === false) return { basis: 'mail_order', source: 'cms_pharmacy_network' }
  if (network?.in_network && network?.retail) return { basis: 'standard_retail', source: 'cms_pharmacy_network' }
  return { basis: 'preferred_retail', source: 'preferred_estimate' }
}

function scaledCostShare(costShare: string | null, negotiated: number | null, factor: number) {
  if (!costShare) return null
  const pct = costShare.match(/(\d+(?:\.\d+)?)\s*%/)
  if (pct && negotiated !== null) return negotiated * (Number(pct[1]) / 100)
  const base = costShareAmount(costShare, negotiated !== null && factor > 0 ? negotiated / factor : negotiated)
  return base === null ? null : base * factor
}

function estimateFillCost(match: Q1DrugMatch, daysSupply: number, basis: Exclude<PricingBasis, 'auto'>) {
  if (!match.covered || !match.source_available) return { cost: null as number | null, retail: null as number | null }
  if (basis === 'mail_order') {
    const retail = daysSupply === 90 ? match.retail_90_day : match.retail_30_day !== null ? match.retail_30_day * (daysSupply / 30) : null
    const costShare = daysSupply === 90 ? match.mail_90_day : match.preferred_30_day
    return { cost: scaledCostShare(costShare, retail, daysSupply / 30), retail }
  }
  const retail = daysSupply === 90 ? (match.retail_90_day ?? (match.retail_30_day !== null ? match.retail_30_day * 3 : null)) : match.retail_30_day !== null ? match.retail_30_day * (daysSupply / 30) : null
  if (basis === 'standard_retail') {
    return { cost: scaledCostShare(match.preferred_30_day, retail, daysSupply / 30), retail }
  }
  return { cost: scaledCostShare(match.preferred_30_day, retail, daysSupply / 30), retail }
}

function simulateYear(drugs: PlanDrugResult[], deductibleText: string | null) {
  const deductible = deductibleInfo(deductibleText); let deductibleRemaining = deductible.amount; let cumulative = 0; let hasUnknownCost = false
  const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, cost: 0, unknown_drugs: 0, drug_costs: [] as Array<{ rxcui: string; name: string; filled: boolean; cost: number | null; unknown: boolean }> }))
  for (const month of months) {
    for (const drug of drugs) {
      const filled = drug.fill_months.includes(month.month)
      if (!filled) { month.drug_costs.push({ rxcui: drug.rxcui, name: drug.name, filled: false, cost: 0, unknown: false }); continue }
      if (!drug.covered || !drug.source_available) {
        const unknown = !drug.source_available
        if (unknown) { month.unknown_drugs += 1; hasUnknownCost = true }
        month.drug_costs.push({ rxcui: drug.rxcui, name: drug.name, filled: true, cost: drug.covered ? null : 0, unknown })
        continue
      }
      const tier = Number(drug.tier); const retail = drug.requested_days_supply === 90 ? (drug.retail_90_day ?? (drug.retail_30_day !== null ? drug.retail_30_day * 3 : null)) : drug.retail_30_day !== null ? drug.retail_30_day * (drug.requested_days_supply / 30) : null
      let fillCost = drug.estimated_fill_cost
      if (deductibleRemaining > 0 && Number.isFinite(tier) && !deductible.excluded_tiers.has(tier) && retail !== null) {
        const deductiblePiece = Math.min(deductibleRemaining, retail); deductibleRemaining -= deductiblePiece
        if (deductiblePiece >= retail) fillCost = retail
        else if (fillCost !== null && retail > 0) fillCost = deductiblePiece + fillCost * ((retail - deductiblePiece) / retail)
        else fillCost = null
      }
      if (fillCost === null) { month.unknown_drugs += 1; hasUnknownCost = true; month.drug_costs.push({ rxcui: drug.rxcui, name: drug.name, filled: true, cost: null, unknown: true }); continue }
      const room = Math.max(0, PART_D_OOP_CAP_2026 - cumulative); const applied = Math.min(fillCost, room); month.cost += applied; cumulative += applied
      month.drug_costs.push({ rxcui: drug.rxcui, name: drug.name, filled: true, cost: Number(applied.toFixed(2)), unknown: false })
    }
    month.cost = Number(month.cost.toFixed(2))
  }
  return { deductible_amount: deductible.amount, deductible_excluded_tiers: [...deductible.excluded_tiers].sort((a,b) => a-b), months, annual_drug_cost: Number(cumulative.toFixed(2)), has_unknown_cost: hasUnknownCost, reached_part_d_cap: cumulative >= PART_D_OOP_CAP_2026 }
}

async function persistDrugCache(plan: PlanRow, drug: DrugInput, match: Q1DrugMatch, basis: Exclude<PricingBasis, 'auto'>) {
  if (!match.source_available) return
  try {
    const admin = createAdminClient()
    const { data: catalog } = await admin.from('medicare_drug_catalog').upsert({ rxcui: drug.rxcui, drug_name: drug.name, display_name: drug.name, source: 'NLM RxNorm', updated_at: new Date().toISOString() }, { onConflict: 'rxcui' }).select('id').single()
    if (!catalog?.id) return
    await admin.from('medicare_plan_formulary').upsert({ medicare_plan_id: plan.id, drug_id: catalog.id, tier: match.tier, covered: match.covered, prior_authorization: /\bP\b|prior authorization/i.test(match.utilization_management || ''), step_therapy: /\bS\b|step therapy/i.test(match.utilization_management || ''), quantity_limit: /\bQ\b|quantity/i.test(match.utilization_management || ''), source: 'Q1Medicare formulary browser (CMS-derived reference)', source_date: new Date().toISOString().slice(0,10), updated_at: new Date().toISOString() }, { onConflict: 'medicare_plan_id,drug_id' })
    const costText = basis === 'mail_order' ? match.mail_90_day : match.preferred_30_day
    if (match.covered && match.tier && costText) {
      const fixed = costText.includes('$') ? numericMoney(costText) : null; const percent = costText.match(/(\d+(?:\.\d+)?)\s*%/)
      await admin.from('medicare_plan_drug_cost_shares').upsert({ medicare_plan_id: plan.id, tier: match.tier, pharmacy_type: basis, days_supply: basis === 'mail_order' ? 90 : 30, copay: fixed, coinsurance_percent: percent ? Number(percent[1]) : null, source: 'Q1Medicare formulary browser (CMS-derived reference)', source_date: new Date().toISOString().slice(0,10), updated_at: new Date().toISOString() }, { onConflict: 'medicare_plan_id,tier,pharmacy_type,days_supply' })
    }
  } catch {}
}

export async function POST(request: NextRequest) {
  const supabase = await createClient(); const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { plan_ids?: string[]; drugs?: Array<Partial<DrugInput>>; medicaid?: string; pharmacy?: PharmacyInput | null; pharmacy_pricing_basis?: PricingBasis }
  try { body = await request.json() as typeof body } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }

  const planIds = [...new Set((body.plan_ids || []).filter(Boolean))].slice(0, MAX_PLANS)
  const drugs = (body.drugs || []).filter((drug) => drug?.rxcui && drug?.name).map((drug) => {
    const days = ALLOWED_DAYS.has(Number(drug.days_supply)) ? Number(drug.days_supply) as 30|60|90 : 30
    const quantity = Math.min(9999, Math.max(0.01, Number(drug.quantity) || 30))
    return { rxcui: String(drug.rxcui).slice(0,30), name: String(drug.name).slice(0,140), quantity, days_supply: days }
  }).filter((drug,index,all) => all.findIndex((item) => item.rxcui === drug.rxcui) === index).slice(0, MAX_DRUGS)
  const requestedBasis = PRICING_BASES.has(body.pharmacy_pricing_basis || '') ? body.pharmacy_pricing_basis as PricingBasis : 'auto'
  const pharmacy = body.pharmacy?.npi && body.pharmacy?.name ? body.pharmacy : null
  if (!planIds.length) return NextResponse.json({ plans: {}, part_b_standard_premium: PART_B_STANDARD_PREMIUM_2026, part_d_oop_cap: PART_D_OOP_CAP_2026 })

  const { data: planData, error } = await supabase.from('medicare_plans').select(`id, carrier, plan_name, contract_id, plan_id, segment_id, monthly_premium, q1_source_url, ambulance_copay, emergency_room_copay, urgent_care_copay, drug_deductible, drug_oop_cap, formulary_source_url, structured_benefits_verified_at, benefit_details`).in('id', planIds)
  if (error) return NextResponse.json({ error: 'Unable to load plans for comparison.' }, { status: 500 })
  const plans = (planData || []) as PlanRow[]

  const networkMap = new Map<string, PharmacyNetworkRow>()
  if (pharmacy?.id) {
    const { data: pharmacyNetworks } = await supabase.from('medicare_plan_pharmacy_networks').select('medicare_plan_id, in_network, preferred, retail, mail_order, source, source_date, verified_at').eq('pharmacy_id', pharmacy.id).in('medicare_plan_id', planIds)
    for (const row of (pharmacyNetworks || []) as PharmacyNetworkRow[]) networkMap.set(row.medicare_plan_id, row)
  }

  const details = await settleWithConcurrency(plans, 3, async (plan) => ({ plan, details: await loadPlanDetails(plan) }))
  const responsePlans: Record<string, unknown> = {}

  for (const { plan, details: planDetails } of details) {
    const networkRow = networkMap.get(plan.id); const chosen = pharmacyBasis(requestedBasis, networkRow)
    const drugMatches = drugs.length && planDetails.formulary_url ? await settleWithConcurrency(drugs, 4, async (drug) => {
      const match = await fetchQ1DrugMatch(planDetails.formulary_url as string, drug.name)
      const fill = estimateFillCost(match, drug.days_supply, chosen.basis)
      await persistDrugCache(plan, drug, match, chosen.basis)
      return { ...drug, ...match, requested_quantity: drug.quantity, requested_days_supply: drug.days_supply, estimated_fill_cost: fill.cost, fill_months: fillMonths(drug.days_supply), pricing_basis: chosen.basis, pricing_basis_source: chosen.source } satisfies PlanDrugResult
    }) : drugs.map((drug) => ({ ...drug, covered: false, source_available: false, drug_name: drug.name, tier: null, tier_description: null, preferred_30_day: null, mail_90_day: null, utilization_management: null, retail_30_day: null, retail_90_day: null, source_url: null, requested_quantity: drug.quantity, requested_days_supply: drug.days_supply, estimated_fill_cost: null, fill_months: fillMonths(drug.days_supply), pricing_basis: chosen.basis, pricing_basis_source: chosen.source } satisfies PlanDrugResult))

    const year = simulateYear(drugMatches, planDetails.drug_deductible)
    const monthlyPremium = numericMoney(plan.monthly_premium) || 0
    const credit = numericMoney(planDetails.part_b_credit) || numericMoney(detailString(plan.benefit_details, 'part_b_credit_monthly')) || 0
    const netPartB = Math.max(0, PART_B_STANDARD_PREMIUM_2026 - credit)
    const annualPlanPremium = monthlyPremium * 12; const annualPartB = netPartB * 12
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
      selected_pharmacy: pharmacy,
      pharmacy_network: pharmacy ? { known: Boolean(networkRow), in_network: networkRow?.in_network ?? null, preferred: networkRow?.preferred ?? null, retail: networkRow?.retail ?? null, mail_order: networkRow?.mail_order ?? null, source: networkRow?.source || null, verified_at: networkRow?.verified_at || null, pricing_basis_used: chosen.basis, pricing_basis_source: chosen.source } : null,
      drugs: drugMatches,
      covers_all_medications: drugs.length > 0 && drugMatches.every((drug) => drug.covered),
      medication_source_unavailable: drugMatches.some((drug) => !drug.source_available),
      monthly_drug_breakdown: year.months,
      estimated_annual_drug_cost: year.annual_drug_cost,
      estimated_annual_plan_premium: Number(annualPlanPremium.toFixed(2)),
      estimated_annual_standard_part_b: Number(annualPartB.toFixed(2)),
      estimated_annual_total_standard_part_b_plus_plan_plus_drugs: Number((annualPlanPremium + annualPartB + year.annual_drug_cost).toFixed(2)),
      drug_cost_has_unknowns: year.has_unknown_cost,
      deductible_amount: year.deductible_amount,
      deductible_excluded_tiers: year.deductible_excluded_tiers,
      reached_part_d_cap: year.reached_part_d_cap,
      quantity_pricing_note: 'Quantity is preserved in the comparison. Published plan prices are supply-based; the estimate does not blindly multiply a 30-day price by tablet count.',
      source: 'CMS plan/PBP data + CMS NPPES pharmacy identity + Q1Medicare CMS-derived formulary reference + NLM RxNorm'
    }
  }

  return NextResponse.json({
    plans: responsePlans,
    part_b_standard_premium: PART_B_STANDARD_PREMIUM_2026,
    part_d_oop_cap: PART_D_OOP_CAP_2026,
    medication_count: drugs.length,
    pharmacy,
    pharmacy_pricing_basis: requestedBasis,
    estimate_note: 'Drug totals use the selected days supply and actual fill months. Retail pricing uses the published plan 30-day retail cost sharing when available, including standard-retail comparisons; mail-order pricing uses the published mail-order amount when available. A price is shown as unknown only when the source does not provide enough cost-sharing information to calculate it.',
    lis_note: body.medicaid && body.medicaid !== 'none' ? 'The selected Medicaid/MSP level may qualify the beneficiary for Extra Help, so actual prescription copays may be lower than the standard estimate shown.' : null
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
