'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import s from './MedicarePlanFinderPro.module.css'

const MISSISSIPPI_COUNTIES = ['Adams','Alcorn','Amite','Attala','Benton','Bolivar','Calhoun','Carroll','Chickasaw','Choctaw','Claiborne','Clarke','Clay','Coahoma','Copiah','Covington','DeSoto','Forrest','Franklin','George','Greene','Grenada','Hancock','Harrison','Hinds','Holmes','Humphreys','Issaquena','Itawamba','Jackson','Jasper','Jefferson','Jefferson Davis','Jones','Kemper','Lafayette','Lamar','Lauderdale','Lawrence','Leake','Lee','Leflore','Lincoln','Lowndes','Madison','Marion','Marshall','Monroe','Montgomery','Neshoba','Newton','Noxubee','Oktibbeha','Panola','Pearl River','Perry','Pike','Pontotoc','Prentiss','Quitman','Rankin','Scott','Sharkey','Simpson','Smith','Stone','Sunflower','Tallahatchie','Tate','Tippah','Tishomingo','Tunica','Union','Walthall','Warren','Washington','Wayne','Webster','Wilkinson','Winston','Yalobusha','Yazoo'] as const
const CARRIERS = ['All carriers', 'Aetna', 'Devoted', 'HealthSpring', 'Humana', 'UnitedHealthcare'] as const
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type MedicarePlan = {
  id: string; carrier: string; plan_name: string; contract_id: string; plan_id: string; segment_id: string; plan_key: string; plan_type: string | null; snp_type: string | null
  monthly_premium: string | null; moop_in_network: string | null; pcp_copay: string | null; specialist_copay: string | null; inpatient_hospital: string | null
  ambulance_copay: string | null; emergency_room_copay: string | null; urgent_care_copay: string | null; drug_deductible: string | null; drug_oop_cap: string | null
  part_b_standard_premium: string | null; part_b_credit: string | null; part_b_net_standard_cost: string | null
  dental_annual_allowance: string | null; vision_annual_allowance?: string | null; hearing_annual_allowance?: string | null
  vision_summary: string | null; hearing_summary: string | null; dental_benefit: string | null; vision_benefit: string | null; hearing_benefit: string | null
  otc_allowance: string | null; food_allowance: string | null; is_dsnp: boolean; medicaid_match_status: string; cms_source_date: string | null; q1_source_url: string | null; source_note: string | null
  benefit_source?: string | null
}
type SearchPayload = { county: string; medicaid: string; plan_year: number; results: MedicarePlan[]; count: number; cms_source_date: string; error?: string }
type DoctorSuggestion = { npi: string; location_key: string; name: string; credential: string | null; specialty: string | null; address: string; city: string; state: string; postal_code: string; distance_miles: number }
type DoctorMatch = { slot_id: string; npi: string; location_key: string | null; name: string; status: 'in_network' | 'out_of_network' | 'not_verified' | 'source_unavailable'; source_url: string | null; verified_at: string | null; message: string | null; verification_method: 'cache' | 'live' | 'unavailable' }
type NetworkPlan = { plan_id: string; all_selected_in_network: boolean; doctor_matches: DoctorMatch[] }
type NetworkPayload = { plans: Record<string, NetworkPlan>; message?: string | null; error?: string }
type DrugSuggestion = { rxcui: string; name: string; synonym?: string | null; tty?: string | null }
type DrugSlot = { id: string; selected?: DrugSuggestion; quantity: number; days_supply: 30 | 60 | 90 }
type PharmacySuggestion = { id?: string | null; npi: string; location_key: string; name: string; address: string; city: string; state: string; postal_code: string; phone: string | null; specialty?: string | null; distance_miles: number }
type DrugResult = DrugSuggestion & {
  covered: boolean; source_available: boolean; drug_name: string; tier: string | null; tier_description: string | null; preferred_30_day: string | null; mail_90_day: string | null
  utilization_management: string | null; retail_30_day: number | null; retail_90_day: number | null; source_url: string | null; requested_quantity: number; requested_days_supply: number
  estimated_fill_cost: number | null; fill_months: number[]; pricing_basis: 'preferred_retail' | 'standard_retail' | 'mail_order'; pricing_basis_source: string
}
type PharmacyNetwork = { known: boolean; in_network: boolean | null; preferred: boolean | null; retail: boolean | null; mail_order: boolean | null; source: string | null; verified_at: string | null; pricing_basis_used: string; pricing_basis_source: string }
type FullPlanComparison = {
  plan_id: string; ambulance_copay: string | null; emergency_room_copay: string | null; urgent_care_copay: string | null; drug_deductible: string | null; drug_oop_cap: string | null
  part_b_standard_premium: number; part_b_giveback: number; part_b_net_standard_premium: number; selected_pharmacy: PharmacySuggestion | null; pharmacy_network: PharmacyNetwork | null
  drugs: DrugResult[]; covers_all_medications: boolean; medication_source_unavailable: boolean
  monthly_drug_breakdown: Array<{ month: number; cost: number; unknown_drugs: number; drug_costs: Array<{ rxcui: string; name: string; filled: boolean; cost: number | null; unknown: boolean }> }>
  estimated_annual_drug_cost: number; estimated_annual_plan_premium: number; estimated_annual_standard_part_b: number; estimated_annual_total_standard_part_b_plus_plan_plus_drugs: number
  drug_cost_has_unknowns: boolean; deductible_amount: number; deductible_excluded_tiers: number[]; reached_part_d_cap: boolean; quantity_pricing_note?: string
}
type ComparisonPayload = { plans: Record<string, FullPlanComparison>; part_b_standard_premium: number; part_d_oop_cap: number; estimate_note?: string; lis_note?: string | null; error?: string }
type DoctorSlot = { id: string; selected?: DoctorSuggestion }
type CmsRefresh = { status: 'checking' | 'current' | 'refreshing' | 'error'; message: string }

type PricingBasis = 'auto' | 'preferred_retail' | 'standard_retail' | 'mail_order'

function money(value: number | null | undefined) { return value === null || value === undefined || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) }
function display(value: string | null | undefined) { return value?.trim() || 'Not published — verify plan materials' }
function shortDisplay(value: string | null | undefined) { return value?.trim() || '—' }
function sourceDate(value: string | null | undefined) { if (!value) return '—'; const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value); return match ? `${Number(match[2])}/${Number(match[3])}/${match[1]}` : value }

function DoctorAutocomplete({ slot, zip, radius, index, onSelect, onRemove, canRemove }: { slot: DoctorSlot; zip: string; radius: string; index: number; onSelect: (id: string, doctor?: DoctorSuggestion) => void; onRemove: (id: string) => void; canRemove: boolean }) {
  const [query, setQuery] = useState(slot.selected?.name || ''); const [results, setResults] = useState<DoctorSuggestion[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  useEffect(() => {
    if (slot.selected || query.trim().length < 2 || !/^\d{5}$/.test(zip)) { setResults([]); return }
    const controller = new AbortController(); const timer = setTimeout(async () => {
      setLoading(true); setError('')
      try { const response = await fetch(`/api/providers/search?q=${encodeURIComponent(query.trim())}&zip=${zip}&radius=${radius}`, { signal: controller.signal }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Doctor search failed'); setResults(body.results || []) }
      catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Doctor search failed') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, zip, radius, slot.selected])
  return <div className={s.autocompleteRow}><div className={s.autocompleteMain}><label>Doctor {index + 1}</label>{slot.selected ? <div className={s.selectedItem}><div><strong>{slot.selected.name}{slot.selected.credential ? `, ${slot.selected.credential}` : ''}</strong><span>{slot.selected.specialty || 'Provider'} · {slot.selected.distance_miles} mi</span><small>{slot.selected.address}, {slot.selected.city}, MS {slot.selected.postal_code}</small></div><button type="button" onClick={() => { onSelect(slot.id); setQuery('') }}>Change</button></div> : <div className={s.autocompleteWrap}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={/^\d{5}$/.test(zip) ? 'Start typing first or last name' : 'Enter ZIP first'} disabled={!/^\d{5}$/.test(zip)} autoComplete="off" />{loading && <span className={s.searchHint}>Searching…</span>}{error && <span className={s.errorText}>{error}</span>}{results.length > 0 && <div className={s.suggestions}>{results.map((doctor) => <button type="button" key={doctor.location_key} onClick={() => { onSelect(slot.id, doctor); setResults([]); setQuery(doctor.name) }}><strong>{doctor.name}{doctor.credential ? `, ${doctor.credential}` : ''}</strong><span>{doctor.specialty || 'Provider'} · {doctor.distance_miles} mi</span><small>{doctor.address}, {doctor.city}, MS {doctor.postal_code}</small></button>)}</div>}</div>}</div>{canRemove && <button type="button" className={s.removeTiny} onClick={() => onRemove(slot.id)}>×</button>}</div>
}

function DrugAutocomplete({ slot, index, onSelect, onRemove, onDetails, canRemove }: { slot: DrugSlot; index: number; onSelect: (id: string, drug?: DrugSuggestion) => void; onRemove: (id: string) => void; onDetails: (id: string, patch: Partial<Pick<DrugSlot,'quantity'|'days_supply'>>) => void; canRemove: boolean }) {
  const [query, setQuery] = useState(slot.selected?.name || ''); const [results, setResults] = useState<DrugSuggestion[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  useEffect(() => {
    if (slot.selected || query.trim().length < 2) { setResults([]); return }
    const controller = new AbortController(); const timer = setTimeout(async () => {
      setLoading(true); setError('')
      try { const response = await fetch(`/api/drugs/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Medication search failed'); setResults(body.results || []) }
      catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Medication search failed') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 275)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, slot.selected])
  return <div className={s.autocompleteRow}><div className={s.autocompleteMain}><label>Medication {index + 1}</label>{slot.selected ? <div className={`${s.selectedItem} ${s.selectedDrug}`}><div><strong>{slot.selected.name}</strong><span>RxNorm {slot.selected.rxcui}</span><div className={s.drugControls}><label>Quantity<input type="number" min="0.01" step="0.01" value={slot.quantity} onChange={(e) => onDetails(slot.id, { quantity: Math.max(0.01, Number(e.target.value) || 1) })} /></label><label>Days supply<select value={slot.days_supply} onChange={(e) => onDetails(slot.id, { days_supply: Number(e.target.value) as 30|60|90 })}><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label></div></div><button type="button" onClick={() => { onSelect(slot.id); setQuery('') }}>Change</button></div> : <div className={s.autocompleteWrap}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Example: metformin 500 mg" autoComplete="off" />{loading && <span className={s.searchHint}>Searching RxNorm…</span>}{error && <span className={s.errorText}>{error}</span>}{results.length > 0 && <div className={s.suggestions}>{results.map((drug) => <button type="button" key={drug.rxcui} onClick={() => { onSelect(slot.id, drug); setResults([]); setQuery(drug.name) }}><strong>{drug.name}</strong><small>RxNorm {drug.rxcui}</small></button>)}</div>}</div>}</div>{canRemove && <button type="button" className={s.removeTiny} onClick={() => onRemove(slot.id)}>×</button>}</div>
}

function PharmacyAutocomplete({ zip, radius, selected, onSelect }: { zip: string; radius: string; selected: PharmacySuggestion | null; onSelect: (pharmacy: PharmacySuggestion | null) => void }) {
  const [query, setQuery] = useState(selected?.name || ''); const [results, setResults] = useState<PharmacySuggestion[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  useEffect(() => {
    if (selected || query.trim().length < 2 || !/^\d{5}$/.test(zip)) { setResults([]); return }
    const controller = new AbortController(); const timer = setTimeout(async () => {
      setLoading(true); setError('')
      try { const response = await fetch(`/api/pharmacies/search?q=${encodeURIComponent(query.trim())}&zip=${zip}&radius=${radius}`, { signal: controller.signal }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Pharmacy search failed'); setResults(body.results || []) }
      catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Pharmacy search failed') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, zip, radius, selected])
  return <div className={s.autocompleteMain}><label>Preferred pharmacy</label>{selected ? <div className={s.selectedItem}><div><strong>{selected.name}</strong><span>{selected.distance_miles} mi · NPI {selected.npi}</span><small>{selected.address}, {selected.city}, MS {selected.postal_code}{selected.phone ? ` · ${selected.phone}` : ''}</small></div><button type="button" onClick={() => { onSelect(null); setQuery('') }}>Change</button></div> : <div className={s.autocompleteWrap}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={/^\d{5}$/.test(zip) ? 'Start typing pharmacy name' : 'Enter ZIP first'} disabled={!/^\d{5}$/.test(zip)} autoComplete="off" />{loading && <span className={s.searchHint}>Searching pharmacies…</span>}{error && <span className={s.errorText}>{error}</span>}{results.length > 0 && <div className={s.suggestions}>{results.map((pharmacy) => <button type="button" key={pharmacy.location_key} onClick={() => { onSelect(pharmacy); setResults([]); setQuery(pharmacy.name) }}><strong>{pharmacy.name}</strong><span>{pharmacy.distance_miles} mi</span><small>{pharmacy.address}, {pharmacy.city}, MS {pharmacy.postal_code}</small></button>)}</div>}</div>}</div>
}

function DoctorBadge({ match }: { match: DoctorMatch }) {
  if (match.status === 'in_network') return <div className={`${s.statusBadge} ${s.inNetwork}`}><b>✓</b><span><strong>{match.name}</strong><small>IN NETWORK</small></span></div>
  if (match.status === 'out_of_network') return <div className={`${s.statusBadge} ${s.outNetwork}`}><b>✕</b><span><strong>{match.name}</strong><small>OUT OF NETWORK</small></span></div>
  return <div className={`${s.statusBadge} ${s.unknown}`}><b>{match.status === 'source_unavailable' ? '!' : '?'}</b><span><strong>{match.name}</strong><small>{match.status === 'source_unavailable' ? 'DIRECTORY UNAVAILABLE' : 'NOT VERIFIED'}</small></span></div>
}
function DrugBadge({ drug }: { drug: DrugResult }) {
  if (!drug.source_available) return <div className={`${s.statusBadge} ${s.unknown}`}><b>?</b><span><strong>{drug.name}</strong><small>FORMULARY SOURCE UNAVAILABLE</small></span></div>
  if (!drug.covered) return <div className={`${s.statusBadge} ${s.outNetwork}`}><b>✕</b><span><strong>{drug.name}</strong><small>NOT ON FORMULARY</small></span></div>
  return <div className={`${s.statusBadge} ${drug.estimated_fill_cost === null ? s.unknown : s.inNetwork}`}><b>{drug.estimated_fill_cost === null ? '?' : '✓'}</b><span><strong>{drug.drug_name}</strong><small>Tier {drug.tier || '—'} · Qty {drug.requested_quantity} / {drug.requested_days_supply} days · {drug.estimated_fill_cost === null ? 'cost verify' : `${money(drug.estimated_fill_cost)} est. fill`}</small></span></div>
}
function PharmacyStatus({ full }: { full: FullPlanComparison }) {
  const network = full.pharmacy_network
  if (!full.selected_pharmacy || !network) return null
  if (network.known && network.in_network === false) return <div className={`${s.statusBadge} ${s.outNetwork}`}><b>✕</b><span><strong>{full.selected_pharmacy.name}</strong><small>OUT OF PLAN PHARMACY NETWORK</small></span></div>
  if (network.known && network.in_network) return <div className={`${s.statusBadge} ${network.preferred ? s.inNetwork : s.unknown}`}><b>{network.preferred ? '✓' : '•'}</b><span><strong>{full.selected_pharmacy.name}</strong><small>{network.preferred ? 'PREFERRED NETWORK PHARMACY' : 'IN NETWORK · STANDARD RETAIL'}</small></span></div>
  return <div className={`${s.statusBadge} ${s.unknown}`}><b>?</b><span><strong>{full.selected_pharmacy.name}</strong><small>PLAN PHARMACY STATUS NOT VERIFIED · {network.pricing_basis_used.replace(/_/g,' ').toUpperCase()}</small></span></div>
}
function cell(value: ReactNode, strong = false) { return <td className={strong ? s.strongCell : ''}>{value}</td> }

export default function MedicarePlanFinderProV2() {
  const [county, setCounty] = useState(''); const [zip, setZip] = useState(''); const [radius, setRadius] = useState('25'); const [medicaid, setMedicaid] = useState('none')
  const [doctorSlots, setDoctorSlots] = useState<DoctorSlot[]>([{ id: 'doctor-1' }]); const [drugSlots, setDrugSlots] = useState<DrugSlot[]>([{ id: 'drug-1', quantity: 30, days_supply: 30 }])
  const [pharmacy, setPharmacy] = useState<PharmacySuggestion | null>(null); const [pricingBasis, setPricingBasis] = useState<PricingBasis>('auto')
  const [payload, setPayload] = useState<SearchPayload | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const [carrier, setCarrier] = useState<(typeof CARRIERS)[number]>('All carriers'); const [onlyAllDoctors, setOnlyAllDoctors] = useState(false); const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(true); const [showDifferencesOnly, setShowDifferencesOnly] = useState(false); const [network, setNetwork] = useState<NetworkPayload | null>(null); const [networkLoading, setNetworkLoading] = useState(false)
  const [comparison, setComparison] = useState<ComparisonPayload | null>(null); const [comparisonLoading, setComparisonLoading] = useState(false); const [comparisonError, setComparisonError] = useState('')
  const [cmsRefresh, setCmsRefresh] = useState<CmsRefresh>({ status: 'checking', message: 'Checking official CMS 2026 PBP benefits…' }); const [cmsTick, setCmsTick] = useState(0)

  const selectedDoctors = useMemo(() => doctorSlots.filter((slot) => slot.selected).map((slot) => ({ slot_id: slot.id, ...slot.selected! })), [doctorSlots])
  const selectedDrugs = useMemo(() => drugSlots.filter((slot) => slot.selected).map((slot) => ({ ...slot.selected!, quantity: slot.quantity, days_supply: slot.days_supply })), [drugSlots])
  const planIdSignature = payload?.results.map((plan) => plan.id).join('|') || ''; const doctorSignature = selectedDoctors.map((d) => `${d.slot_id}:${d.npi}:${d.location_key}`).join('|')
  const drugSignature = selectedDrugs.map((d) => `${d.rxcui}:${d.quantity}:${d.days_supply}`).join('|'); const pharmacySignature = pharmacy ? `${pharmacy.id || ''}:${pharmacy.npi}:${pharmacy.location_key}:${pricingBasis}` : `none:${pricingBasis}`

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const statusResponse = await fetch('/api/cms/pbp-refresh', { cache: 'no-store' }); const statusBody = await statusResponse.json(); const state = statusBody.state
        const isFresh = state?.last_success_at && Date.now() - new Date(state.last_success_at).getTime() < 30 * 86400000
        if (isFresh) { if (!cancelled) setCmsRefresh({ status: 'current', message: `Official CMS PBP benefits current · ${state.records_processed || 0} plans enriched` }); return }
        if (state?.status === 'running') { if (!cancelled) setCmsRefresh({ status: 'refreshing', message: 'Official CMS PBP benefit refresh is already running…' }); return }
        if (!cancelled) setCmsRefresh({ status: 'refreshing', message: 'Updating official CMS 2026 PBP benefits…' })
        const response = await fetch('/api/cms/pbp-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: false }) }); const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'CMS benefit refresh failed')
        if (!cancelled) { setCmsRefresh({ status: 'current', message: `Official CMS PBP benefits current · ${body.records_processed || 0} plans enriched` }); setCmsTick((value) => value + 1) }
      } catch (err) { if (!cancelled) setCmsRefresh({ status: 'error', message: `CMS benefit refresh unavailable — existing verified data remains active. ${err instanceof Error ? err.message : ''}` }) }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!payload || cmsTick === 0) return
    const controller = new AbortController()
    fetch(`/api/medicare-plans?county=${encodeURIComponent(payload.county)}&medicaid=${encodeURIComponent(medicaid)}`, { signal: controller.signal }).then((r) => r.json().then((body) => ({ ok: r.ok, body }))).then(({ok,body}) => { if (ok) setPayload(body) }).catch(() => {})
    return () => controller.abort()
  }, [cmsTick])

  useEffect(() => {
    if (!payload?.results.length || !selectedDoctors.length) { setNetwork(null); setOnlyAllDoctors(false); return }
    const controller = new AbortController(); setNetworkLoading(true)
    fetch('/api/providers/network-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctors: selectedDoctors, plan_ids: payload.results.map((plan) => plan.id) }), signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Doctor network check failed'); setNetwork(body) })
      .catch((err) => { if (!controller.signal.aborted) setNetwork({ plans: {}, error: err instanceof Error ? err.message : 'Doctor network check failed' }) })
      .finally(() => { if (!controller.signal.aborted) setNetworkLoading(false) })
    return () => controller.abort()
  }, [planIdSignature, doctorSignature])

  useEffect(() => {
    if (!selectedPlanIds.length) { setComparison(null); setComparisonError(''); return }
    const controller = new AbortController(); const timer = setTimeout(() => {
      setComparisonLoading(true); setComparisonError('')
      fetch('/api/plan-comparison', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_ids: selectedPlanIds, drugs: selectedDrugs, medicaid, pharmacy, pharmacy_pricing_basis: pricingBasis }), signal: controller.signal })
        .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Plan comparison failed'); setComparison(body) })
        .catch((err) => { if (!controller.signal.aborted) setComparisonError(err instanceof Error ? err.message : 'Plan comparison failed') })
        .finally(() => { if (!controller.signal.aborted) setComparisonLoading(false) })
    }, 180)
    return () => { clearTimeout(timer); controller.abort() }
  }, [selectedPlanIds.join('|'), drugSignature, medicaid, pharmacySignature])

  async function searchPlans(event: FormEvent) {
    event.preventDefault(); const normalizedCounty = county.trim().replace(/\s+county$/i, '')
    if (!normalizedCounty) { setError('Choose a Mississippi county.'); return }
    setLoading(true); setError(''); setSelectedPlanIds([]); setComparison(null); setCarrier('All carriers')
    try { const response = await fetch(`/api/medicare-plans?county=${encodeURIComponent(normalizedCounty)}&medicaid=${encodeURIComponent(medicaid)}`); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to load plans'); setPayload(body) }
    catch (err) { setPayload(null); setError(err instanceof Error ? err.message : 'Unable to load plans') } finally { setLoading(false) }
  }

  function addDoctor() { if (doctorSlots.length < 5) setDoctorSlots((rows) => [...rows, { id: `doctor-${Date.now()}` }]) }
  function selectDoctor(id: string, selected?: DoctorSuggestion) { setDoctorSlots((rows) => rows.map((row) => row.id === id ? { ...row, selected } : row)); setOnlyAllDoctors(false) }
  function removeDoctor(id: string) { setDoctorSlots((rows) => rows.filter((row) => row.id !== id)); setOnlyAllDoctors(false) }
  function addDrug() { if (drugSlots.length < 10) setDrugSlots((rows) => [...rows, { id: `drug-${Date.now()}`, quantity: 30, days_supply: 30 }]) }
  function selectDrug(id: string, selected?: DrugSuggestion) { setDrugSlots((rows) => rows.map((row) => row.id === id ? { ...row, selected } : row)) }
  function updateDrug(id: string, patch: Partial<Pick<DrugSlot,'quantity'|'days_supply'>>) { setDrugSlots((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row)) }
  function removeDrug(id: string) { setDrugSlots((rows) => rows.filter((row) => row.id !== id)) }
  function togglePlan(id: string) { setSelectedPlanIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 4 ? [...current, id] : current); setShowComparison(true) }
  function resetLocationDependent(value: string, kind: 'zip'|'radius') { if (kind === 'zip') setZip(value); else setRadius(value); setDoctorSlots((rows) => rows.map((row) => ({ id: row.id }))); setPharmacy(null); setOnlyAllDoctors(false) }

  const filteredPlans = useMemo(() => (payload?.results || []).filter((plan) => (carrier === 'All carriers' || plan.carrier === carrier) && (!onlyAllDoctors || !selectedDoctors.length || network?.plans?.[plan.id]?.all_selected_in_network)), [payload, carrier, onlyAllDoctors, network, selectedDoctors.length])
  const selectedPlans = useMemo(() => (payload?.results || []).filter((plan) => selectedPlanIds.includes(plan.id)), [payload, selectedPlanIds])
  const comparisonRows = useMemo(() => [
    { label: 'Monthly plan premium', get: (p: MedicarePlan) => shortDisplay(p.monthly_premium) },
    { label: '2026 standard Part B premium', get: (p: MedicarePlan) => shortDisplay(p.part_b_standard_premium) },
    { label: 'Part B giveback', get: (p: MedicarePlan) => shortDisplay(p.part_b_credit) },
    { label: 'Net standard Part B after giveback', get: (p: MedicarePlan) => comparison?.plans[p.id] ? `${money(comparison.plans[p.id].part_b_net_standard_premium)} / month` : shortDisplay(p.part_b_net_standard_cost) },
    { label: 'Medical max out-of-pocket', get: (p: MedicarePlan) => shortDisplay(p.moop_in_network) },
    { label: 'Drug deductible', get: (p: MedicarePlan) => shortDisplay(comparison?.plans[p.id]?.drug_deductible || p.drug_deductible) },
    { label: 'Drug out-of-pocket cap', get: (p: MedicarePlan) => shortDisplay(comparison?.plans[p.id]?.drug_oop_cap || p.drug_oop_cap) },
    { label: 'Primary care doctor', get: (p: MedicarePlan) => shortDisplay(p.pcp_copay) },
    { label: 'Specialist', get: (p: MedicarePlan) => shortDisplay(p.specialist_copay) },
    { label: 'Inpatient hospital', get: (p: MedicarePlan) => shortDisplay(p.inpatient_hospital) },
    { label: 'Ambulance', get: (p: MedicarePlan) => shortDisplay(comparison?.plans[p.id]?.ambulance_copay || p.ambulance_copay) },
    { label: 'Emergency room', get: (p: MedicarePlan) => shortDisplay(comparison?.plans[p.id]?.emergency_room_copay || p.emergency_room_copay) },
    { label: 'Urgent care', get: (p: MedicarePlan) => shortDisplay(comparison?.plans[p.id]?.urgent_care_copay || p.urgent_care_copay) },
    { label: 'Dental allowance / benefit', get: (p: MedicarePlan) => shortDisplay(p.dental_annual_allowance || p.dental_benefit) },
    { label: 'Vision allowance / benefit', get: (p: MedicarePlan) => shortDisplay(p.vision_annual_allowance || p.vision_summary || p.vision_benefit) },
    { label: 'Hearing allowance / benefit', get: (p: MedicarePlan) => shortDisplay(p.hearing_annual_allowance || p.hearing_summary || p.hearing_benefit) },
    { label: 'OTC allowance', get: (p: MedicarePlan) => shortDisplay(p.otc_allowance) },
    { label: 'Food allowance', get: (p: MedicarePlan) => shortDisplay(p.food_allowance) },
    { label: 'Estimated annual drug cost', get: (p: MedicarePlan) => comparison?.plans[p.id] ? `${money(comparison.plans[p.id].estimated_annual_drug_cost)}${comparison.plans[p.id].drug_cost_has_unknowns ? ' + unknown' : ''}` : '—' },
    { label: 'Estimated annual total: standard Part B + plan + drugs', get: (p: MedicarePlan) => comparison?.plans[p.id] ? `${money(comparison.plans[p.id].estimated_annual_total_standard_part_b_plus_plan_plus_drugs)}${comparison.plans[p.id].drug_cost_has_unknowns ? ' + unknown' : ''}` : '—' }
  ], [comparison])
  const visibleRows = useMemo(() => comparisonRows.filter((row) => !showDifferencesOnly || selectedPlans.length < 2 || new Set(selectedPlans.map((plan) => row.get(plan))).size > 1), [comparisonRows, selectedPlans, showDifferencesOnly])

  return <div className={s.workspace}>
    <section className={s.searchPanel}>
      <div className={s.sectionTitle}><div><span>STEP 1</span><h2>Client location & eligibility</h2><p>County controls plan availability. ZIP and radius control doctor and pharmacy searches.</p></div><div className={`${s.cmsStatus} ${s[`cms_${cmsRefresh.status}`] || ''}`}>{cmsRefresh.message}</div></div>
      <form className={s.locationGrid} onSubmit={searchPlans}>
        <label>Mississippi county<input list="ms-counties-v2" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Example: Alcorn" autoComplete="off" /><datalist id="ms-counties-v2">{MISSISSIPPI_COUNTIES.map((name) => <option value={name} key={name} />)}</datalist></label>
        <label>ZIP code<input inputMode="numeric" value={zip} onChange={(e) => resetLocationDependent(e.target.value.replace(/\D/g, '').slice(0,5), 'zip')} placeholder="Example: 38834" maxLength={5} /></label>
        <label>Search radius<select value={radius} onChange={(e) => resetLocationDependent(e.target.value, 'radius')}><option value="5">5 miles</option><option value="10">10 miles</option><option value="25">25 miles</option><option value="50">50 miles</option><option value="100">100 miles</option></select></label>
        <label>Medicaid / MSP level<select value={medicaid} onChange={(e) => setMedicaid(e.target.value)}><option value="none">No Medicaid / MSP</option><option value="qmb">QMB</option><option value="slmb">SLMB</option><option value="qi">QI</option><option value="fbde">FBDE / Full Medicaid</option><option value="other">Other Medicaid</option></select></label>
        <button className={s.primaryButton} type="submit" disabled={loading}>{loading ? 'SEARCHING…' : 'FIND PLANS'}</button>
      </form>{error && <div className={s.errorBox}>{error}</div>}
    </section>

    <div className={s.twoColumnSetup}>
      <section className={s.setupPanel}><div className={s.sectionTitle}><div><span>STEP 2</span><h2>Doctors</h2><p>Add up to 5 doctors. Each selected office is checked plan-by-plan.</p></div><button type="button" className={s.secondaryButton} onClick={addDoctor} disabled={doctorSlots.length >= 5}>+ Add doctor</button></div><div className={s.stack}>{doctorSlots.map((slot,i) => <DoctorAutocomplete key={slot.id} slot={slot} zip={zip} radius={radius} index={i} onSelect={selectDoctor} onRemove={removeDoctor} canRemove={doctorSlots.length > 1} />)}</div></section>
      <section className={s.setupPanel}><div className={s.sectionTitle}><div><span>STEP 3</span><h2>Medications</h2><p>Add exact drug/strength, quantity, and days supply. Up to 10 medications.</p></div><button type="button" className={s.secondaryButton} onClick={addDrug} disabled={drugSlots.length >= 10}>+ Add medication</button></div><div className={s.stack}>{drugSlots.map((slot,i) => <DrugAutocomplete key={slot.id} slot={slot} index={i} onSelect={selectDrug} onRemove={removeDrug} onDetails={updateDrug} canRemove={drugSlots.length > 1} />)}</div></section>
    </div>

    <section className={`${s.setupPanel} ${s.pharmacyPanel}`}><div className={s.sectionTitle}><div><span>STEP 4</span><h2>Pharmacy & prescription pricing</h2><p>Select the client’s pharmacy. Auto pricing uses a cached CMS plan/pharmacy status when available; otherwise the comparison clearly labels the pricing assumption.</p></div></div><div className={s.pharmacyGrid}><PharmacyAutocomplete zip={zip} radius={radius} selected={pharmacy} onSelect={setPharmacy} /><label>Pricing basis<select value={pricingBasis} onChange={(e) => setPricingBasis(e.target.value as PricingBasis)}><option value="auto">Auto · CMS status if available</option><option value="preferred_retail">Preferred retail estimate</option><option value="standard_retail">Standard retail · show unknown if not published</option><option value="mail_order">Mail order</option></select><small>Use Auto unless you already know the plan classifies this pharmacy as preferred or standard.</small></label></div></section>

    {payload && <section className={s.resultsSection}>
      <div className={s.resultsHeader}><div><span>STEP 5</span><h2>{payload.count} plans in {payload.county} County</h2><p>CMS plan data updated {sourceDate(payload.cms_source_date)} · select up to 4 plans for full comparison.</p></div><div className={s.filters}><label>Carrier<select value={carrier} onChange={(e) => setCarrier(e.target.value as (typeof CARRIERS)[number])}>{CARRIERS.map((item) => <option key={item}>{item}</option>)}</select></label>{selectedDoctors.length > 0 && <button type="button" className={`${s.filterButton} ${onlyAllDoctors ? s.filterOn : ''}`} onClick={() => setOnlyAllDoctors((v) => !v)}>{onlyAllDoctors ? '✓ ONLY IN-NETWORK DOCTORS' : 'ONLY IN-NETWORK DOCTORS'}</button>}</div></div>
      {networkLoading && <div className={s.infoBox}>Checking selected doctors against plan networks…</div>}{network?.error && <div className={s.errorBox}>{network.error}</div>}
      <div className={s.planGrid}>{filteredPlans.map((plan) => {
        const selected = selectedPlanIds.includes(plan.id); const networkPlan = network?.plans?.[plan.id]; const full = comparison?.plans?.[plan.id]
        return <article key={plan.id} className={`${s.planCard} ${selected ? s.planSelected : ''}`}><div className={s.planCardHeader}><div><span className={s.carrier}>{plan.carrier}</span><h3>{plan.plan_name}</h3><small>{plan.plan_key} · {plan.plan_type || 'Medicare Advantage'}{plan.is_dsnp ? ' · D-SNP' : ''}</small></div><label className={s.compareCheck}><input type="checkbox" checked={selected} onChange={() => togglePlan(plan.id)} disabled={!selected && selectedPlanIds.length >= 4} /><span>{selected ? 'Selected' : 'Compare'}</span></label></div>
          <div className={s.quickStats}><div><span>Premium</span><strong>{shortDisplay(plan.monthly_premium)}</strong></div><div><span>Medical MOOP</span><strong>{shortDisplay(plan.moop_in_network)}</strong></div><div><span>Part B giveback</span><strong>{shortDisplay(plan.part_b_credit)}</strong></div><div><span>Rx deductible</span><strong>{shortDisplay(full?.drug_deductible || plan.drug_deductible)}</strong></div></div>
          {selectedDoctors.length > 0 && <div className={s.statusGroup}><h4>Doctors</h4>{networkPlan?.doctor_matches?.length ? networkPlan.doctor_matches.map((match) => <DoctorBadge key={`${plan.id}-${match.slot_id}`} match={match} />) : <div className={s.mutedStatus}>{networkLoading ? 'Checking doctors…' : 'Doctor match not available yet.'}</div>}</div>}
          {selected && pharmacy && full && <div className={s.statusGroup}><h4>Pharmacy</h4><PharmacyStatus full={full} /></div>}
          {selectedDrugs.length > 0 && selected && <div className={s.statusGroup}><h4>Medications</h4>{comparisonLoading && !full ? <div className={s.mutedStatus}>Checking formulary and costs…</div> : full?.drugs?.map((drug) => <DrugBadge key={`${plan.id}-${drug.rxcui}`} drug={drug} />)}</div>}
          <div className={s.benefitGrid}><div><span>PCP</span><strong>{display(plan.pcp_copay)}</strong></div><div><span>Specialist</span><strong>{display(plan.specialist_copay)}</strong></div><div className={s.wide}><span>Hospital</span><strong>{display(plan.inpatient_hospital)}</strong></div><div><span>Ambulance</span><strong>{display(full?.ambulance_copay || plan.ambulance_copay)}</strong></div><div><span>ER</span><strong>{display(full?.emergency_room_copay || plan.emergency_room_copay)}</strong></div><div><span>Urgent care</span><strong>{display(full?.urgent_care_copay || plan.urgent_care_copay)}</strong></div><div><span>Drug OOP cap</span><strong>{display(full?.drug_oop_cap || plan.drug_oop_cap)}</strong></div><div><span>Dental</span><strong>{display(plan.dental_annual_allowance || plan.dental_benefit)}</strong></div><div><span>Vision</span><strong>{display(plan.vision_annual_allowance || plan.vision_summary || plan.vision_benefit)}</strong></div><div><span>Hearing</span><strong>{display(plan.hearing_annual_allowance || plan.hearing_summary || plan.hearing_benefit)}</strong></div><div><span>OTC</span><strong>{display(plan.otc_allowance)}</strong></div><div><span>Food</span><strong>{display(plan.food_allowance)}</strong></div></div>
          <div className={s.cardFooter}>{plan.q1_source_url && <a href={plan.q1_source_url} target="_blank" rel="noreferrer">Plan reference ↗</a>}<span>{plan.benefit_source || 'Verified plan data'}</span>{selected && full && <strong>Est. annual total: {money(full.estimated_annual_total_standard_part_b_plus_plan_plus_drugs)}{full.drug_cost_has_unknowns ? ' + unknown' : ''}</strong>}</div>
        </article>
      })}</div>{!filteredPlans.length && <div className={s.emptyBox}>No plans match the current filters.</div>}
    </section>}

    {selectedPlans.length > 0 && showComparison && <section className={s.compareSection}>
      <div className={s.compareHeader}><div><span>STEP 6</span><h2>True side-by-side comparison</h2><p>Benefits, doctors, pharmacy, medications, monthly prescription costs, and annual total.</p></div><div className={s.compareActions}><label><input type="checkbox" checked={showDifferencesOnly} onChange={(e) => setShowDifferencesOnly(e.target.checked)} /> Show differences only</label><button type="button" className={s.secondaryButton} onClick={() => setShowComparison(false)}>Hide comparison</button></div></div>
      {comparisonLoading && <div className={s.infoBox}>Loading detailed plan and prescription costs…</div>}{comparisonError && <div className={s.errorBox}>{comparisonError}</div>}
      <div className={s.tableScroll}><table className={s.compareTable}><thead><tr><th>Benefit / cost</th>{selectedPlans.map((plan) => <th key={plan.id}><span>{plan.carrier}</span><strong>{plan.plan_name}</strong><small>{plan.plan_key}</small></th>)}</tr></thead><tbody>
        {visibleRows.map((row) => <tr key={row.label}><th>{row.label}</th>{selectedPlans.map((plan) => cell(row.get(plan), /annual total/i.test(row.label)))}</tr>)}
        {pharmacy && <tr><th>Pharmacy · {pharmacy.name}</th>{selectedPlans.map((plan) => <td key={plan.id}>{comparison?.plans[plan.id] ? <PharmacyStatus full={comparison.plans[plan.id]} /> : 'Checking…'}</td>)}</tr>}
        {selectedDoctors.map((doctor) => <tr key={`doctor-${doctor.slot_id}`} className={s.doctorCompareRow}><th>Doctor · {doctor.name}</th>{selectedPlans.map((plan) => { const match = network?.plans?.[plan.id]?.doctor_matches?.find((item) => item.slot_id === doctor.slot_id); return <td key={plan.id}>{match ? <DoctorBadge match={match} /> : 'Checking…'}</td> })}</tr>)}
        {selectedDrugs.map((selectedDrug) => <tr key={`drug-${selectedDrug.rxcui}`}><th>Medication · {selectedDrug.name}<small>Qty {selectedDrug.quantity} · {selectedDrug.days_supply}-day supply</small></th>{selectedPlans.map((plan) => { const result = comparison?.plans?.[plan.id]?.drugs?.find((drug) => drug.rxcui === selectedDrug.rxcui); return <td key={plan.id}>{result ? <DrugBadge drug={result} /> : comparisonLoading ? 'Checking…' : '—'}</td> })}</tr>)}
        {selectedDrugs.length > 0 && MONTH_NAMES.map((monthName,index) => <tr key={`month-${monthName}`} className={s.monthRow}><th>{monthName} prescription estimate</th>{selectedPlans.map((plan) => { const month = comparison?.plans?.[plan.id]?.monthly_drug_breakdown?.find((item) => item.month === index + 1); return <td key={plan.id}><strong>{month ? money(month.cost) : '—'}</strong>{month?.unknown_drugs ? <small>{month.unknown_drugs} unknown cost{month.unknown_drugs === 1 ? '' : 's'}</small> : null}</td> })}</tr>)}
      </tbody></table></div>
      {comparison?.lis_note && <div className={s.warningBox}>{comparison.lis_note}</div>}{comparison?.estimate_note && <div className={s.infoBox}>{comparison.estimate_note}</div>}
    </section>}

    {selectedPlans.length > 0 && !showComparison && <button type="button" className={s.floatingCompare} onClick={() => setShowComparison(true)}>COMPARE {selectedPlans.length} {selectedPlans.length === 1 ? 'PLAN' : 'PLANS'}</button>}
    <footer className={s.sourceFooter}>Plan benefits prioritize official CMS 2026 PBP data when imported, with CMS landscape data for availability/premium/MOOP, CMS NPPES for doctor and pharmacy identity/location, CMS-derived formulary references for drug tiers/cost sharing, and NLM RxNorm for medication terminology. Pharmacy-specific network preference is never guessed: when CMS plan/pharmacy status is not cached, the UI labels the pricing basis as an estimate. Verify final enrollment details with Medicare.gov or the carrier.</footer>
  </div>
}
