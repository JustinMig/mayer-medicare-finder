'use client'

import { useEffect, useMemo, useState } from 'react'
import s from './MedicarePlanFinderPro.module.css'

type PlanSummary={id:string;carrier:string;plan_name:string;plan_key:string;plan_type:string|null;monthly_premium:string|null;moop_in_network:string|null;part_b_credit:string|null;pcp_copay:string|null;specialist_copay:string|null;inpatient_hospital:string|null;ambulance_copay:string|null;emergency_room_copay:string|null;urgent_care_copay:string|null;dental_annual_allowance:string|null;dental_benefit:string|null;vision_annual_allowance?:string|null;vision_summary:string|null;vision_benefit:string|null;hearing_annual_allowance?:string|null;hearing_summary:string|null;hearing_benefit:string|null;otc_allowance:string|null;food_allowance:string|null}
type Service={code:string;label:string;details:string[]}
type DetailPayload={plan:{carrier:string;plan_name:string;plan_key:string;plan_type:string|null};overview:Record<string,string|null>;extras:Record<string,string|null>;services:Service[];source_url:string|null;note:string;error?:string}

function value(v:string|null|undefined){return v?.trim()||'Not published — verify plan materials'}

const groups=[
  {title:'Hospital & facility care',test:(c:string)=>/^(1|2|5|6)/.test(c)},
  {title:'Doctor & professional services',test:(c:string)=>/^7/.test(c)},
  {title:'Tests, imaging & outpatient care',test:(c:string)=>/^(8|9)/.test(c)},
  {title:'Emergency, transportation & medical equipment',test:(c:string)=>/^(4|10|11|12)/.test(c)},
  {title:'Preventive & supplemental medical benefits',test:(c:string)=>/^(13|14)/.test(c)},
  {title:'Dental, vision & hearing',test:(c:string)=>/^(16|17|18)/.test(c)},
]

export default function PlanFullBenefitsModal({plan,onClose}:{plan:PlanSummary;onClose:()=>void}){
  const [data,setData]=useState<DetailPayload|null>(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(true)
  useEffect(()=>{const c=new AbortController(); setLoading(true); setError(''); fetch(`/api/plan-full-benefits?id=${encodeURIComponent(plan.id)}`,{signal:c.signal}).then(async r=>{const b=await r.json(); if(!r.ok)throw new Error(b.error||'Unable to load plan benefits'); setData(b)}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'Unable to load plan benefits')}).finally(()=>{if(!c.signal.aborted)setLoading(false)}); return()=>c.abort()},[plan.id])
  const sections=useMemo(()=>groups.map(g=>({...g,items:(data?.services||[]).filter(x=>g.test(x.code))})).filter(g=>g.items.length),[data])
  const headline=[['Monthly premium',plan.monthly_premium],['Part B giveback',plan.part_b_credit],['Medical MOOP',plan.moop_in_network],['Primary care',plan.pcp_copay],['Specialist',plan.specialist_copay],['Inpatient hospital',plan.inpatient_hospital],['Ambulance',plan.ambulance_copay],['Emergency room',plan.emergency_room_copay],['Urgent care',plan.urgent_care_copay]] as const
  const extras=[['Dental',plan.dental_annual_allowance||plan.dental_benefit],['Vision',plan.vision_annual_allowance||plan.vision_summary||plan.vision_benefit],['Hearing',plan.hearing_annual_allowance||plan.hearing_summary||plan.hearing_benefit],['OTC',plan.otc_allowance],['Food / healthy foods',plan.food_allowance]] as const
  return <div role="dialog" aria-modal="true" onClick={onClose} style={{position:'fixed',inset:0,zIndex:1200,background:'rgba(15,23,42,.55)',display:'flex',justifyContent:'center',alignItems:'stretch',padding:12}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'min(980px,100%)',background:'#fff',borderRadius:18,overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,.3)'}}>
      <div style={{padding:'18px 20px',borderBottom:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',gap:18,alignItems:'flex-start'}}><div><div style={{fontSize:12,fontWeight:800,textTransform:'uppercase',letterSpacing:'.06em',opacity:.65}}>{plan.carrier}</div><h2 style={{margin:'4px 0 3px',fontSize:22}}>{plan.plan_name}</h2><div style={{fontSize:13,opacity:.72}}>{plan.plan_key} · {plan.plan_type||'Medicare Advantage'}</div></div><button type="button" className={s.secondaryButton} onClick={onClose}>Close</button></div>
      <div style={{overflow:'auto',padding:'18px 20px 28px'}}>
        <section><h3 style={{margin:'0 0 10px'}}>Plan costs at a glance</h3><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:9}}>{headline.map(([label,v])=><div key={label} style={{border:'1px solid #e2e8f0',borderRadius:10,padding:'10px 12px'}}><div style={{fontSize:12,fontWeight:800,opacity:.62}}>{label}</div><div style={{fontWeight:750,marginTop:4}}>{value(v)}</div></div>)}</div></section>
        <section style={{marginTop:22}}><h3 style={{margin:'0 0 10px'}}>Extra benefits</h3><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:9}}>{extras.map(([label,v])=><div key={label} style={{border:'1px solid #e2e8f0',borderRadius:10,padding:'10px 12px'}}><div style={{fontSize:12,fontWeight:800,opacity:.62}}>{label}</div><div style={{fontWeight:700,marginTop:4,lineHeight:1.35}}>{value(v)}</div></div>)}</div></section>
        <section style={{marginTop:24}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'baseline'}}><h3 style={{margin:0}}>Full medical benefit details</h3><small style={{opacity:.6}}>Loaded only when this view is opened</small></div>{loading&&<div className={s.infoBox} style={{marginTop:12}}>Loading complete CMS plan benefits…</div>}{error&&<div className={s.errorBox} style={{marginTop:12}}>{error}</div>}{!loading&&!error&&sections.map(section=><div key={section.title} style={{marginTop:16,border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden'}}><div style={{background:'#f8fafc',padding:'10px 13px',fontWeight:850}}>{section.title}</div>{section.items.map(item=><div key={`${item.code}-${item.label}`} style={{padding:'11px 13px',borderTop:'1px solid #edf0f4',display:'grid',gridTemplateColumns:'minmax(190px,34%) 1fr',gap:14}}><div><strong>{item.label}</strong><div style={{fontSize:11,opacity:.5,marginTop:2}}>CMS PBP {item.code}</div></div><div>{item.details.map((d,i)=><div key={i} style={{marginBottom:i===item.details.length-1?0:4}}>{d}</div>)}</div></div>)}</div>)}</section>
        <div style={{marginTop:22,padding:'12px 14px',background:'#f8fafc',borderRadius:10,fontSize:12,lineHeight:1.45,opacity:.78}}>This view is built from the plan’s stored 2026 CMS Plan Benefit Package data. Prescription drug and pharmacy details remain intentionally excluded from this Finder. Final limitations, exclusions, prior authorization rules and legal terms should be verified in the Summary of Benefits or Evidence of Coverage.</div>
      </div>
    </div>
  </div>
}
