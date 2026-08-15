import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const LABELS: Record<string, string> = {
  '1a':'Inpatient hospital - acute','1a1':'Additional inpatient hospital days','1b':'Inpatient psychiatric hospital','2':'Skilled nursing facility',
  '3':'Cardiac & pulmonary rehabilitation','3-1':'Cardiac rehabilitation','3-2':'Intensive cardiac rehabilitation','3-3':'Pulmonary rehabilitation','3-4':'Other rehabilitation services',
  '4a':'Emergency care','4b':'Urgent care','4c1':'Worldwide emergency care','4c2':'Worldwide urgent care','4c3':'Worldwide emergency transportation',
  '5a':'Partial hospitalization','5b':'Outpatient substance use treatment','6':'Home health care',
  '7a':'Primary care physician','7b':'Chiropractic services','7c':'Occupational therapy','7d':'Physician specialist','7e1':'Outpatient mental health - individual','7e2':'Outpatient mental health - group',
  '7f':'Podiatry','7g':'Other health professionals','7h1':'Psychiatric services - individual','7h2':'Psychiatric services - group','7i':'Physical therapy & speech-language pathology','7j':'Telehealth','7k':'Opioid treatment services',
  '8a1':'Diagnostic procedures & tests','8a2':'Laboratory services','8b1':'Diagnostic radiology','8b2':'Therapeutic radiology','8b3':'Advanced imaging',
  '9a1':'Outpatient hospital services','9a2':'Outpatient observation','9b':'Ambulatory surgical center','9c1':'Outpatient mental health facility','9c2':'Outpatient psychiatric facility','9d':'Outpatient blood services',
  '10a1':'Ground ambulance','10a2':'Air ambulance','10b1':'Routine transportation','10b2':'Non-emergency transportation',
  '11a':'Durable medical equipment','11b1':'Prosthetics','11b2':'Medical supplies','11c1':'Diabetes monitoring supplies','11c2':'Therapeutic shoes / inserts',
  '12':'End-stage renal disease / dialysis','13a':'Acupuncture','13b':'Fitness benefit','13c':'Meals','13d':'Nutrition','13e':'Personal emergency response system','13f':'Other supplemental benefits',
  '14a':'Medicare-covered preventive services','14b':'Additional preventive services','14c1':'Health education','14c2':'Wellness programs','14c3':'Smoking cessation','14c4':'Fitness / wellness','14c5':'Other supplemental health services','14c6':'In-home support services','14c7':'Caregiver support','14c8':'Other supplemental services','14d':'Kidney disease education','14e1':'Additional telehealth services','14e2':'Remote access technologies','14e4':'Post-discharge services','14e5':'Other health support services',
  '15-1':'Part B covered drugs - chemotherapy','15-2':'Part B covered drugs - other','15-3':'Home infusion drugs','16a':'Dental services','17a':'Routine eye exams','17b':'Eyewear','18a':'Hearing services'
}

type Json = Record<string, unknown>

function flatten(value: unknown, rows: Array<[string,string]>, path='') {
  if (Array.isArray(value)) { value.forEach((item,i) => flatten(item, rows, `${path}[${i}]`)); return }
  if (!value || typeof value !== 'object') return
  for (const [key,val] of Object.entries(value as Json)) {
    const next = path ? `${path}.${key}` : key
    if (val && typeof val === 'object') flatten(val, rows, next)
    else if (val !== null && val !== undefined && String(val).trim() !== '') rows.push([next, String(val).trim()])
  }
}

function money(v: string) { const n=Number(v); return Number.isFinite(n) ? `$${n.toLocaleString('en-US',{maximumFractionDigits:2})}` : v }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))] }

function summarize(details: unknown) {
  const rows: Array<[string,string]> = []; flatten(details, rows)
  const pick=(re:RegExp)=>rows.filter(([k])=>re.test(k)).map(([,v])=>v)
  const dayRows: string[]=[]
  const groups=new Map<string,Record<string,string>>()
  for (const [k,v] of rows) {
    const m=k.match(/(.+DayInterval\d+)(BeginDay|EndDay|CopaymentAmount)$/i)
    if (m) { const g=groups.get(m[1])||{}; g[m[2]]=v; groups.set(m[1],g) }
  }
  for (const g of groups.values()) if (g.BeginDay && g.EndDay && g.CopaymentAmount) dayRows.push(`${money(g.CopaymentAmount)} per day, days ${g.BeginDay}-${g.EndDay}`)
  const copays=unique(pick(/Copayment(?:Tier\d+)?Amt$|CopaymentAmount$|Copay.*Amount$/i).filter(v=>!/^[12]$/.test(v)).map(money))
  const coins=unique(pick(/Coinsurance.*(?:Amount|Percentage|Pct)$/i).filter(v=>!/^[12]$/.test(v)).map(v=>`${v}%`))
  const deductibles=unique(pick(/Deductible.*Amount$|DeductibleAmt$/i).filter(v=>!/^[12]$/.test(v)).map(money))
  const maxes=unique(pick(/Max(?:imum)?(?:Enrollee)?Amount$|MaximumBenefit.*Amount$|MaxEnrAmt$/i).filter(v=>!/^[12]$/.test(v)).map(money))
  const parts=[...unique(dayRows)]
  if (copays.length) parts.push(`Copay: ${copays.join(' / ')}`)
  if (coins.length) parts.push(`Coinsurance: ${coins.join(' / ')}`)
  if (deductibles.length) parts.push(`Deductible: ${deductibles.join(' / ')}`)
  if (maxes.length) parts.push(`Benefit limit: ${maxes.join(' / ')}`)
  return parts.slice(0,6)
}

export async function GET(request: NextRequest) {
  const supabase=await createClient(); const {data:claimsData}=await supabase.auth.getClaims()
  if (!claimsData?.claims) return NextResponse.json({error:'Unauthorized'},{status:401})
  const id=(request.nextUrl.searchParams.get('id')||'').trim()
  if (!id) return NextResponse.json({error:'Plan id required'},{status:400})
  const {data,error}=await supabase.from('medicare_plans').select('id,carrier,plan_name,contract_id,plan_id,segment_id,plan_type,monthly_premium,moop_in_network,pcp_copay,specialist_copay,inpatient_hospital,ambulance_copay,emergency_room_copay,urgent_care_copay,otc_benefit,food_benefit,dental_benefit,vision_benefit,hearing_benefit,benefit_details,cms_pbp_raw,cms_pbp_extracted,q1_source_url').eq('id',id).eq('commissionable',true).single()
  if (error || !data) return NextResponse.json({error:'Plan not found'},{status:404})
  const raw=(data.cms_pbp_raw||{}) as Json
  const info=(((raw.benefitDetails as Json|undefined)?.benefitDetailsInfo)||[]) as unknown[]
  const services=info.map((entry)=>{ const e=entry as Json; const code=String(e.categoryCode||''); return {code,label:LABELS[code]||`Medicare benefit ${code}`,details:summarize(e.benefitDetails)} }).filter(x=>x.code && x.details.length)
  return NextResponse.json({
    plan:{id:data.id,carrier:data.carrier,plan_name:data.plan_name,plan_key:`${data.contract_id}-${data.plan_id}${data.segment_id&&data.segment_id!=='0'?`-${data.segment_id}`:''}`,plan_type:data.plan_type},
    overview:{monthly_premium:data.monthly_premium,moop_in_network:data.moop_in_network,pcp_copay:data.pcp_copay,specialist_copay:data.specialist_copay,inpatient_hospital:data.inpatient_hospital,ambulance_copay:data.ambulance_copay,emergency_room_copay:data.emergency_room_copay,urgent_care_copay:data.urgent_care_copay},
    extras:{dental:data.dental_benefit,vision:data.vision_benefit,hearing:data.hearing_benefit,otc:data.otc_benefit,food:data.food_benefit},
    services,
    source_url:data.q1_source_url,
    note:'Prescription drug and pharmacy details are intentionally excluded from this Finder.'
  },{headers:{'Cache-Control':'private, max-age=300, stale-while-revalidate=1800'}})
}
