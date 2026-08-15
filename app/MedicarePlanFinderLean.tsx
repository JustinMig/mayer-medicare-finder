'use client'

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import s from './MedicarePlanFinderPro.module.css'

const MISSISSIPPI_COUNTIES = ['Adams','Alcorn','Amite','Attala','Benton','Bolivar','Calhoun','Carroll','Chickasaw','Choctaw','Claiborne','Clarke','Clay','Coahoma','Copiah','Covington','DeSoto','Forrest','Franklin','George','Greene','Grenada','Hancock','Harrison','Hinds','Holmes','Humphreys','Issaquena','Itawamba','Jackson','Jasper','Jefferson','Jefferson Davis','Jones','Kemper','Lafayette','Lamar','Lauderdale','Lawrence','Leake','Lee','Leflore','Lincoln','Lowndes','Madison','Marion','Marshall','Monroe','Montgomery','Neshoba','Newton','Noxubee','Oktibbeha','Panola','Pearl River','Perry','Pike','Pontotoc','Prentiss','Quitman','Rankin','Scott','Sharkey','Simpson','Smith','Stone','Sunflower','Tallahatchie','Tate','Tippah','Tishomingo','Tunica','Union','Walthall','Warren','Washington','Wayne','Webster','Wilkinson','Winston','Yalobusha','Yazoo'] as const
const CARRIERS = ['All carriers', 'Aetna', 'Devoted', 'HealthSpring', 'Humana', 'UnitedHealthcare'] as const

type MedicarePlan = {
  id: string; carrier: string; plan_name: string; contract_id: string; plan_id: string; segment_id: string; plan_key: string; plan_type: string | null; snp_type: string | null
  monthly_premium: string | null; moop_in_network: string | null; pcp_copay: string | null; specialist_copay: string | null; inpatient_hospital: string | null
  ambulance_copay: string | null; emergency_room_copay: string | null; urgent_care_copay: string | null
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
type DoctorSlot = { id: string; selected?: DoctorSuggestion }

function display(value: string | null | undefined) { return value?.trim() || 'Not published — verify plan materials' }
function shortDisplay(value: string | null | undefined) { return value?.trim() || '—' }
function sourceDate(value: string | null | undefined) { if (!value) return '—'; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value); return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : value }

function DoctorAutocomplete({ slot, zip, radius, index, onSelect, onRemove, canRemove }: { slot: DoctorSlot; zip: string; radius: string; index: number; onSelect: (id: string, doctor?: DoctorSuggestion) => void; onRemove: (id: string) => void; canRemove: boolean }) {
  const [query, setQuery] = useState(slot.selected?.name || '')
  const [results, setResults] = useState<DoctorSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (slot.selected || query.trim().length < 2 || !/^\d{5}$/.test(zip)) { setResults([]); return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const response = await fetch(`/api/providers/search?q=${encodeURIComponent(query.trim())}&zip=${zip}&radius=${radius}`, { signal: controller.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Doctor search failed')
        setResults(body.results || [])
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Doctor search failed') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, zip, radius, slot.selected])
  return <div className={s.autocompleteRow}><div className={s.autocompleteMain}><label>Doctor {index + 1}</label>{slot.selected ? <div className={s.selectedItem}><div><strong>{slot.selected.name}{slot.selected.credential ? `, ${slot.selected.credential}` : ''}</strong><span>{slot.selected.specialty || 'Provider'} · {slot.selected.distance_miles} mi</span><small>{slot.selected.address}, {slot.selected.city}, MS {slot.selected.postal_code}</small></div><button type="button" onClick={() => { onSelect(slot.id); setQuery('') }}>Change</button></div> : <div className={s.autocompleteWrap}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={/^\d{5}$/.test(zip) ? 'Start typing first or last name' : 'Enter ZIP first'} disabled={!/^\d{5}$/.test(zip)} autoComplete="off" />{loading && <span className={s.searchHint}>Searching…</span>}{error && <span className={s.errorText}>{error}</span>}{results.length > 0 && <div className={s.suggestions}>{results.map((doctor) => <button type="button" key={doctor.location_key} onClick={() => { onSelect(slot.id, doctor); setResults([]); setQuery(doctor.name) }}><strong>{doctor.name}{doctor.credential ? `, ${doctor.credential}` : ''}</strong><span>{doctor.specialty || 'Provider'} · {doctor.distance_miles} mi</span><small>{doctor.address}, {doctor.city}, MS {doctor.postal_code}</small></button>)}</div>}</div>}</div>{canRemove && <button type="button" className={s.removeTiny} onClick={() => onRemove(slot.id)}>×</button>}</div>
}

function DoctorBadge({ match }: { match: DoctorMatch }) {
  if (match.status === 'in_network') return <div className={`${s.statusBadge} ${s.inNetwork}`}><b>✓</b><span><strong>{match.name}</strong><small>IN NETWORK</small></span></div>
  if (match.status === 'out_of_network') return <div className={`${s.statusBadge} ${s.outNetwork}`}><b>✕</b><span><strong>{match.name}</strong><small>OUT OF NETWORK</small></span></div>
  return <div className={`${s.statusBadge} ${s.unknown}`}><b>{match.status === 'source_unavailable' ? '!' : '?'}</b><span><strong>{match.name}</strong><small>{match.status === 'source_unavailable' ? 'DIRECTORY UNAVAILABLE' : 'NOT VERIFIED'}</small></span></div>
}

function cell(value: ReactNode, strong = false) { return <td className={strong ? s.strongCell : ''}>{value}</td> }

function BenefitRecap({ plan, onClose }: { plan: MedicarePlan; onClose: () => void }) {
  const rows = [
    ['Monthly premium', plan.monthly_premium], ['Part B giveback', plan.part_b_credit], ['Medical MOOP', plan.moop_in_network],
    ['Primary care', plan.pcp_copay], ['Specialist', plan.specialist_copay], ['Inpatient hospital', plan.inpatient_hospital],
    ['Ambulance', plan.ambulance_copay], ['Emergency room', plan.emergency_room_copay], ['Urgent care', plan.urgent_care_copay],
    ['Dental', plan.dental_annual_allowance || plan.dental_benefit], ['Vision', plan.vision_annual_allowance || plan.vision_summary || plan.vision_benefit],
    ['Hearing', plan.hearing_annual_allowance || plan.hearing_summary || plan.hearing_benefit], ['OTC', plan.otc_allowance], ['Food', plan.food_allowance]
  ]
  return <div role="dialog" aria-modal="true" onClick={onClose} style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.45)',display:'flex',alignItems:'center',justifyContent:'center',padding:18}}>
    <div onClick={(e)=>e.stopPropagation()} style={{width:'min(760px,100%)',maxHeight:'88vh',overflow:'auto',background:'#fff',borderRadius:16,padding:20,boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start',marginBottom:14}}><div><small>{plan.carrier}</small><h2 style={{margin:'4px 0'}}>{plan.plan_name}</h2><div>{plan.plan_key} · {plan.plan_type || 'Medicare Advantage'}</div></div><button type="button" className={s.secondaryButton} onClick={onClose}>Close</button></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}>{rows.map(([label,value])=><div key={label} style={{border:'1px solid #d9dde5',borderRadius:10,padding:'10px 12px'}}><div style={{fontSize:12,fontWeight:700,opacity:.65,marginBottom:4}}>{label}</div><div style={{fontWeight:700}}>{display(value)}</div></div>)}</div>
      <p style={{fontSize:12,opacity:.68,marginTop:14}}>Compact recap only. Use the Summary of Benefits and Evidence of Coverage for complete limitations, exclusions, prior authorization rules, and legal plan terms.</p>
    </div>
  </div>
}

export default function MedicarePlanFinderLean() {
  const [county, setCounty] = useState(''); const [zip, setZip] = useState(''); const [radius, setRadius] = useState('25'); const [medicaid, setMedicaid] = useState('none')
  const [doctorSlots, setDoctorSlots] = useState<DoctorSlot[]>([{ id: 'doctor-1' }])
  const [payload, setPayload] = useState<SearchPayload | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const [carrier, setCarrier] = useState<(typeof CARRIERS)[number]>('All carriers'); const [onlyAllDoctors, setOnlyAllDoctors] = useState(false); const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(true); const [showDifferencesOnly, setShowDifferencesOnly] = useState(false); const [network, setNetwork] = useState<NetworkPayload | null>(null); const [networkLoading, setNetworkLoading] = useState(false)
  const [recapPlan, setRecapPlan] = useState<MedicarePlan | null>(null)

  const selectedDoctors = useMemo(() => doctorSlots.filter((slot) => slot.selected).map((slot) => ({ slot_id: slot.id, ...slot.selected! })), [doctorSlots])
  const planIdSignature = payload?.results.map((plan) => plan.id).join('|') || ''
  const doctorSignature = selectedDoctors.map((d) => `${d.slot_id}:${d.npi}:${d.location_key}`).join('|')

  useEffect(() => {
    if (!payload?.results.length || !selectedDoctors.length) { setNetwork(null); setOnlyAllDoctors(false); return }
    const controller = new AbortController(); setNetworkLoading(true)
    fetch('/api/providers/network-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctors: selectedDoctors, plan_ids: payload.results.map((plan) => plan.id) }), signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Doctor network check failed'); setNetwork(body) })
      .catch((err) => { if (!controller.signal.aborted) setNetwork({ plans: {}, error: err instanceof Error ? err.message : 'Doctor network check failed' }) })
      .finally(() => { if (!controller.signal.aborted) setNetworkLoading(false) })
    return () => controller.abort()
  }, [planIdSignature, doctorSignature])

  async function searchPlans(event: FormEvent) {
    event.preventDefault(); const normalizedCounty = county.trim().replace(/\s+county$/i, '')
    if (!normalizedCounty) { setError('Choose a Mississippi county.'); return }
    setLoading(true); setError(''); setSelectedPlanIds([]); setCarrier('All carriers')
    try { const response = await fetch(`/api/medicare-plans?county=${encodeURIComponent(normalizedCounty)}&medicaid=${encodeURIComponent(medicaid)}`); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to load plans'); setPayload(body) }
    catch (err) { setPayload(null); setError(err instanceof Error ? err.message : 'Unable to load plans') } finally { setLoading(false) }
  }

  function addDoctor() { if (doctorSlots.length < 5) setDoctorSlots((rows) => [...rows, { id: `doctor-${Date.now()}` }]) }
  function selectDoctor(id: string, selected?: DoctorSuggestion) { setDoctorSlots((rows) => rows.map((row) => row.id === id ? { ...row, selected } : row)); setOnlyAllDoctors(false) }
  function removeDoctor(id: string) { setDoctorSlots((rows) => rows.filter((row) => row.id !== id)); setOnlyAllDoctors(false) }
  function togglePlan(id: string) { setSelectedPlanIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 4 ? [...current, id] : current); setShowComparison(true) }
  function resetLocationDependent(value: string, kind: 'zip'|'radius') { if (kind === 'zip') setZip(value); else setRadius(value); setDoctorSlots((rows) => rows.map((row) => ({ id: row.id }))); setOnlyAllDoctors(false) }

  const filteredPlans = useMemo(() => (payload?.results || []).filter((plan) => (carrier === 'All carriers' || plan.carrier === carrier) && (!onlyAllDoctors || !selectedDoctors.length || network?.plans?.[plan.id]?.all_selected_in_network)), [payload, carrier, onlyAllDoctors, network, selectedDoctors.length])
  const selectedPlans = useMemo(() => (payload?.results || []).filter((plan) => selectedPlanIds.includes(plan.id)), [payload, selectedPlanIds])
  const comparisonRows = useMemo(() => [
    { label: 'Monthly plan premium', get: (p: MedicarePlan) => shortDisplay(p.monthly_premium) }, { label: '2026 standard Part B premium', get: (p: MedicarePlan) => shortDisplay(p.part_b_standard_premium) }, { label: 'Part B giveback', get: (p: MedicarePlan) => shortDisplay(p.part_b_credit) }, { label: 'Net standard Part B after giveback', get: (p: MedicarePlan) => shortDisplay(p.part_b_net_standard_cost) }, { label: 'Medical max out-of-pocket', get: (p: MedicarePlan) => shortDisplay(p.moop_in_network) }, { label: 'Primary care doctor', get: (p: MedicarePlan) => shortDisplay(p.pcp_copay) }, { label: 'Specialist', get: (p: MedicarePlan) => shortDisplay(p.specialist_copay) }, { label: 'Inpatient hospital', get: (p: MedicarePlan) => shortDisplay(p.inpatient_hospital) }, { label: 'Ambulance', get: (p: MedicarePlan) => shortDisplay(p.ambulance_copay) }, { label: 'Emergency room', get: (p: MedicarePlan) => shortDisplay(p.emergency_room_copay) }, { label: 'Urgent care', get: (p: MedicarePlan) => shortDisplay(p.urgent_care_copay) }, { label: 'Dental allowance / benefit', get: (p: MedicarePlan) => shortDisplay(p.dental_annual_allowance || p.dental_benefit) }, { label: 'Vision allowance / benefit', get: (p: MedicarePlan) => shortDisplay(p.vision_annual_allowance || p.vision_summary || p.vision_benefit) }, { label: 'Hearing allowance / benefit', get: (p: MedicarePlan) => shortDisplay(p.hearing_annual_allowance || p.hearing_summary || p.hearing_benefit) }, { label: 'OTC allowance', get: (p: MedicarePlan) => shortDisplay(p.otc_allowance) }, { label: 'Food allowance', get: (p: MedicarePlan) => shortDisplay(p.food_allowance) }
  ], [])
  const visibleRows = useMemo(() => comparisonRows.filter((row) => !showDifferencesOnly || selectedPlans.length < 2 || new Set(selectedPlans.map((plan) => row.get(plan))).size > 1), [comparisonRows, selectedPlans, showDifferencesOnly])

  return <div className={s.workspace}>
    {recapPlan && <BenefitRecap plan={recapPlan} onClose={() => setRecapPlan(null)} />}
    <section className={s.searchPanel}><div className={s.sectionTitle}><div><span>STEP 1</span><h2>Client location & eligibility</h2><p>County controls plan availability. ZIP and radius are used only for doctor searches.</p></div></div><form className={s.locationGrid} onSubmit={searchPlans}><label>Mississippi county<input list="ms-counties-lean" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="Example: Alcorn" autoComplete="off" /><datalist id="ms-counties-lean">{MISSISSIPPI_COUNTIES.map((name) => <option value={name} key={name} />)}</datalist></label><label>ZIP code<input inputMode="numeric" value={zip} onChange={(e) => resetLocationDependent(e.target.value.replace(/\D/g, '').slice(0,5), 'zip')} placeholder="Example: 38834" maxLength={5} /></label><label>Doctor radius<select value={radius} onChange={(e) => resetLocationDependent(e.target.value, 'radius')}><option value="5">5 miles</option><option value="10">10 miles</option><option value="25">25 miles</option><option value="50">50 miles</option><option value="100">100 miles</option></select></label><label>Medicaid / MSP level<select value={medicaid} onChange={(e) => setMedicaid(e.target.value)}><option value="none">No Medicaid / MSP</option><option value="qmb">QMB</option><option value="slmb">SLMB</option><option value="qi">QI</option><option value="fbde">FBDE / Full Medicaid</option><option value="other">Other Medicaid</option></select></label><button className={s.primaryButton} type="submit" disabled={loading}>{loading ? 'SEARCHING…' : 'FIND PLANS'}</button></form>{error && <div className={s.errorBox}>{error}</div>}</section>

    <section className={s.setupPanel}><div className={s.sectionTitle}><div><span>STEP 2</span><h2>Doctors</h2><p>Add up to 5 doctors. Each selected office is checked plan-by-plan.</p></div><button type="button" className={s.secondaryButton} onClick={addDoctor} disabled={doctorSlots.length >= 5}>+ Add doctor</button></div><div className={s.stack}>{doctorSlots.map((slot,i) => <DoctorAutocomplete key={slot.id} slot={slot} zip={zip} radius={radius} index={i} onSelect={selectDoctor} onRemove={removeDoctor} canRemove={doctorSlots.length > 1} />)}</div></section>

    {payload && <section className={s.resultsSection}><div className={s.resultsHeader}><div><span>STEP 3</span><h2>{payload.count} commissionable plans in {payload.county} County</h2><p>CMS plan data updated {sourceDate(payload.cms_source_date)} · select up to 4 plans to compare.</p></div><div className={s.filters}><label>Carrier<select value={carrier} onChange={(e) => setCarrier(e.target.value as (typeof CARRIERS)[number])}>{CARRIERS.map((item) => <option key={item}>{item}</option>)}</select></label>{selectedDoctors.length > 0 && <button type="button" className={`${s.filterButton} ${onlyAllDoctors ? s.filterOn : ''}`} onClick={() => setOnlyAllDoctors((v) => !v)}>{onlyAllDoctors ? '✓ ONLY IN-NETWORK DOCTORS' : 'ONLY IN-NETWORK DOCTORS'}</button>}</div></div>{networkLoading && <div className={s.infoBox}>Checking selected doctors against plan networks…</div>}{network?.error && <div className={s.errorBox}>{network.error}</div>}
      <div className={s.planGrid}>{filteredPlans.map((plan) => { const selected = selectedPlanIds.includes(plan.id); const networkPlan = network?.plans?.[plan.id]; return <article key={plan.id} className={`${s.planCard} ${selected ? s.planSelected : ''}`}><div className={s.planCardHeader}><div><span className={s.carrier}>{plan.carrier}</span><h3>{plan.plan_name}</h3><small>{plan.plan_key} · {plan.plan_type || 'Medicare Advantage'}{plan.is_dsnp ? ' · D-SNP' : ''}</small></div><label className={s.compareCheck}><input type="checkbox" checked={selected} onChange={() => togglePlan(plan.id)} disabled={!selected && selectedPlanIds.length >= 4} /><span>{selected ? 'Selected' : 'Compare'}</span></label></div>
        <div className={s.quickStats}><div><span>Premium</span><strong>{shortDisplay(plan.monthly_premium)}</strong></div><div><span>Medical MOOP</span><strong>{shortDisplay(plan.moop_in_network)}</strong></div><div><span>Part B giveback</span><strong>{shortDisplay(plan.part_b_credit)}</strong></div><div><span>PCP</span><strong>{shortDisplay(plan.pcp_copay)}</strong></div></div>
        {selectedDoctors.length > 0 && <div className={s.statusGroup}><h4>Doctors</h4>{networkPlan?.doctor_matches?.length ? networkPlan.doctor_matches.map((match) => <DoctorBadge key={`${plan.id}-${match.slot_id}`} match={match} />) : <div className={s.mutedStatus}>{networkLoading ? 'Checking doctors…' : 'Doctor match not available yet.'}</div>}</div>}
        <div className={s.benefitGrid}><div><span>PCP</span><strong>{display(plan.pcp_copay)}</strong></div><div><span>Specialist</span><strong>{display(plan.specialist_copay)}</strong></div><div className={s.wide}><span>Hospital</span><strong>{display(plan.inpatient_hospital)}</strong></div><div><span>Ambulance</span><strong>{display(plan.ambulance_copay)}</strong></div><div><span>ER</span><strong>{display(plan.emergency_room_copay)}</strong></div><div><span>Urgent care</span><strong>{display(plan.urgent_care_copay)}</strong></div><div><span>Dental</span><strong>{display(plan.dental_annual_allowance || plan.dental_benefit)}</strong></div><div><span>Vision</span><strong>{display(plan.vision_annual_allowance || plan.vision_summary || plan.vision_benefit)}</strong></div><div><span>Hearing</span><strong>{display(plan.hearing_annual_allowance || plan.hearing_summary || plan.hearing_benefit)}</strong></div><div><span>OTC</span><strong>{display(plan.otc_allowance)}</strong></div><div><span>Food</span><strong>{display(plan.food_allowance)}</strong></div></div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12}}><a className={s.secondaryButton} href={`/api/plan-document?id=${encodeURIComponent(plan.id)}&type=summary`} target="_blank" rel="noreferrer">Summary of Benefits ↗</a><a className={s.secondaryButton} href={`/api/plan-document?id=${encodeURIComponent(plan.id)}&type=eoc`} target="_blank" rel="noreferrer">Evidence of Coverage ↗</a><button type="button" className={s.secondaryButton} onClick={() => setRecapPlan(plan)}>Compact Benefit Recap</button></div>
        <div className={s.cardFooter}>{plan.q1_source_url && <a href={plan.q1_source_url} target="_blank" rel="noreferrer">Plan reference ↗</a>}<span>{plan.benefit_source || 'Verified plan data'}</span></div></article> })}</div>{!filteredPlans.length && <div className={s.emptyBox}>No plans match the current filters.</div>}</section>}

    {selectedPlans.length > 0 && showComparison && <section className={s.compareSection}><div className={s.compareHeader}><div><span>STEP 4</span><h2>Side-by-side comparison</h2><p>Compare medical benefits, allowances, and selected doctors.</p></div><div className={s.compareActions}><label><input type="checkbox" checked={showDifferencesOnly} onChange={(e) => setShowDifferencesOnly(e.target.checked)} /> Show differences only</label><button type="button" className={s.secondaryButton} onClick={() => setShowComparison(false)}>Hide comparison</button></div></div><div className={s.tableScroll}><table className={s.compareTable}><thead><tr><th>Benefit / cost</th>{selectedPlans.map((plan) => <th key={plan.id}><span>{plan.carrier}</span><strong>{plan.plan_name}</strong><small>{plan.plan_key}</small></th>)}</tr></thead><tbody>{visibleRows.map((row) => <tr key={row.label}><th>{row.label}</th>{selectedPlans.map((plan) => cell(row.get(plan)))}</tr>)}{selectedDoctors.map((doctor) => <tr key={`doctor-${doctor.slot_id}`} className={s.doctorCompareRow}><th>Doctor · {doctor.name}</th>{selectedPlans.map((plan) => { const match = network?.plans?.[plan.id]?.doctor_matches?.find((item) => item.slot_id === doctor.slot_id); return <td key={plan.id}>{match ? <DoctorBadge match={match} /> : 'Checking…'}</td> })}</tr>)}</tbody></table></div></section>}
    {selectedPlans.length > 0 && !showComparison && <button type="button" className={s.floatingCompare} onClick={() => setShowComparison(true)}>COMPARE {selectedPlans.length} {selectedPlans.length === 1 ? 'PLAN' : 'PLANS'}</button>}
    <footer className={s.sourceFooter}>Plan benefits use the Finder’s stored Medicare plan data and CMS references. Doctor identity/location uses CMS NPPES and network status is checked only when doctors are selected. Finder plan inventory is restricted to plans verified as commissionable for independent agents. Verify final enrollment details with Medicare.gov, the carrier, Summary of Benefits, or Evidence of Coverage.</footer>
  </div>
}
