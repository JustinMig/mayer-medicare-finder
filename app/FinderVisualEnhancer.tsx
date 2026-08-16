'use client'

import { useEffect } from 'react'

const panelClasses = ['finder-tone-location','finder-tone-doctors','finder-tone-results','finder-tone-compare']

const responsiveCss = `
/* Compact eHealth-inspired list layout: fast scanning, no extra data loading. */
.medicare-standalone-content .finder-plan-list { display:grid !important; grid-template-columns:1fr !important; gap:10px !important; }
.medicare-standalone-content .finder-plan-row { display:grid !important; gap:10px !important; padding:14px 16px !important; border-radius:12px !important; box-shadow:0 2px 8px rgba(15,23,42,.05) !important; }
.medicare-standalone-content .finder-plan-header { margin:0 !important; }
.medicare-standalone-content .finder-plan-header h3 { font-size:1.02rem !important; margin:2px 0 !important; }
.medicare-standalone-content .finder-key-strip { display:grid !important; grid-template-columns:repeat(4,minmax(0,1fr)) !important; gap:0 !important; border:1px solid #dbe3ec !important; border-radius:10px !important; overflow:hidden !important; background:#fff !important; }
.medicare-standalone-content .finder-key-strip > div { border:0 !important; border-right:1px solid #e2e8f0 !important; border-radius:0 !important; background:transparent !important; padding:8px 10px !important; }
.medicare-standalone-content .finder-key-strip > div:last-child { border-right:0 !important; }
.medicare-standalone-content .finder-key-strip span { font-size:.62rem !important; margin-bottom:2px !important; }
.medicare-standalone-content .finder-key-strip strong { font-size:.88rem !important; }
.medicare-standalone-content .finder-benefit-rows { display:grid !important; grid-template-columns:repeat(2,minmax(0,1fr)) !important; gap:0 24px !important; }
.medicare-standalone-content .finder-benefit-rows > div { display:grid !important; grid-template-columns:minmax(92px,38%) 1fr !important; align-items:start !important; gap:10px !important; border:0 !important; border-bottom:1px solid #e5e7eb !important; border-radius:0 !important; background:transparent !important; padding:7px 0 !important; min-height:36px !important; }
.medicare-standalone-content .finder-benefit-rows > div > span { margin:0 !important; color:#64748b !important; font-size:.69rem !important; line-height:1.35 !important; }
.medicare-standalone-content .finder-benefit-rows > div > strong { font-size:.76rem !important; line-height:1.35 !important; text-align:left !important; }
.medicare-standalone-content .finder-plan-actions { margin-top:2px !important; padding-top:8px !important; border-top:1px solid #e2e8f0 !important; }
.medicare-standalone-content .finder-plan-actions a,
.medicare-standalone-content .finder-plan-actions button { min-height:36px !important; padding:7px 10px !important; font-size:.72rem !important; }
.medicare-standalone-content .finder-plan-footer { padding-top:7px !important; }

@media (max-width: 700px) {
  .medicare-standalone-content .finder-tone-results { padding:12px !important; }
  .medicare-standalone-content .finder-tone-results > div:first-child { margin-bottom:10px !important; }
  .medicare-standalone-content .finder-plan-row { padding:12px !important; gap:9px !important; }
  .medicare-standalone-content .finder-plan-header { display:grid !important; grid-template-columns:1fr auto !important; gap:8px !important; }
  .medicare-standalone-content .finder-plan-header h3 { font-size:.96rem !important; line-height:1.25 !important; }
  .medicare-standalone-content .finder-key-strip { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
  .medicare-standalone-content .finder-key-strip > div { border-bottom:1px solid #e2e8f0 !important; }
  .medicare-standalone-content .finder-key-strip > div:nth-child(2) { border-right:0 !important; }
  .medicare-standalone-content .finder-key-strip > div:nth-child(3),
  .medicare-standalone-content .finder-key-strip > div:nth-child(4) { border-bottom:0 !important; }
  .medicare-standalone-content .finder-benefit-rows { grid-template-columns:1fr !important; gap:0 !important; }
  .medicare-standalone-content .finder-benefit-rows > div { grid-template-columns:108px minmax(0,1fr) !important; padding:7px 1px !important; }
  .medicare-standalone-content .finder-plan-actions { display:grid !important; grid-template-columns:1fr !important; gap:7px !important; }
  .medicare-standalone-content .finder-plan-actions a,
  .medicare-standalone-content .finder-plan-actions button { width:100% !important; min-height:42px !important; justify-content:center !important; text-align:center !important; white-space:normal !important; }
  .medicare-standalone-content .finder-plan-footer { display:none !important; }
  .medicare-standalone-content .finder-tone-location,
  .medicare-standalone-content .finder-tone-doctors { padding:14px !important; }
}

@media (min-width:701px) and (max-width:1100px) {
  .medicare-standalone-content .finder-plan-row { padding:14px !important; }
  .medicare-standalone-content .finder-benefit-rows { grid-template-columns:repeat(2,minmax(0,1fr)) !important; gap:0 18px !important; }
}
`

export default function FinderVisualEnhancer() {
  useEffect(() => {
    let frame = 0

    let style = document.getElementById('finder-compact-responsive-style') as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = 'finder-compact-responsive-style'
      style.textContent = responsiveCss
      document.head.appendChild(style)
    }

    const addComparisonActions = (root: Element) => {
      const table = root.querySelector('section.finder-tone-compare table') as HTMLTableElement | null
      if (!table) return
      const headers = Array.from(table.querySelectorAll('thead th')).slice(1)
      if (!headers.length) return
      const planNames = headers.map((header) => header.querySelector('strong')?.textContent?.trim() || '')
      const signature = planNames.join('|')
      let footer = table.querySelector('tfoot[data-plan-actions="true"]') as HTMLTableSectionElement | null
      if (footer?.dataset.signature === signature) return
      footer?.remove()
      footer = document.createElement('tfoot')
      footer.dataset.planActions = 'true'; footer.dataset.signature = signature
      const row = document.createElement('tr')
      const label = document.createElement('th'); label.textContent = 'Plan documents & details'; row.appendChild(label)
      planNames.forEach((planName) => {
        const cell = document.createElement('td')
        const stack = document.createElement('div'); stack.style.display='grid'; stack.style.gap='8px'
        const card = Array.from(root.querySelectorAll('article')).find((article) => article.querySelector('h3')?.textContent?.trim() === planName)
        const summary = card?.querySelector('a[href*="type=summary"]') as HTMLAnchorElement | null
        const eoc = card?.querySelector('a[href*="type=eoc"]') as HTMLAnchorElement | null
        const benefits = Array.from(card?.querySelectorAll('button') || []).find((button) => button.textContent?.includes('View Full Plan Benefits')) as HTMLButtonElement | undefined
        const makeButton = (text:string, action:()=>void, disabled=false) => { const b=document.createElement('button'); b.type='button'; b.textContent=text; b.disabled=disabled; b.style.cssText='width:100%;min-height:38px;padding:8px 10px;border-radius:8px;border:1px solid rgba(15,23,42,.18);background:#fff;font-weight:700;cursor:pointer;white-space:normal'; if(!disabled)b.addEventListener('click',action); return b }
        stack.appendChild(makeButton('Summary of Benefits ↗',()=>summary?.click(),!summary))
        stack.appendChild(makeButton('Evidence of Coverage ↗',()=>eoc?.click(),!eoc))
        stack.appendChild(makeButton('View Full Plan Benefits',()=>benefits?.click(),!benefits))
        cell.appendChild(stack); row.appendChild(cell)
      })
      footer.appendChild(row); table.appendChild(footer)
    }

    const classifyPlans = (root: Element) => {
      const articles = Array.from(root.querySelectorAll('article')).filter(a => a.querySelector('h3'))
      if (!articles.length) return
      const parent = articles[0].parentElement
      parent?.classList.add('finder-plan-list')
      articles.forEach(article => {
        article.classList.add('finder-plan-row')
        const direct = Array.from(article.children) as HTMLElement[]
        direct.find(el => el.querySelector(':scope h3'))?.classList.add('finder-plan-header')
        direct.find(el => el.children.length === 4 && !el.querySelector('h4'))?.classList.add('finder-key-strip')
        direct.find(el => Array.from(el.querySelectorAll(':scope > div > span')).some(x => ['PCP','Specialist','Hospital','Dental','Vision','Hearing','OTC','Food'].includes(x.textContent?.trim() || '')))?.classList.add('finder-benefit-rows')
        direct.find(el => !!el.querySelector('a[href*="type=summary"]'))?.classList.add('finder-plan-actions')
        const footer = direct.find(el => !!el.querySelector('a') && !el.querySelector('a[href*="type=summary"]') && !el.querySelector('h3'))
        footer?.classList.add('finder-plan-footer')
      })
    }

    const apply = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const root = document.querySelector('.medicare-standalone-content')
        if (!root) return
        root.querySelectorAll('section').forEach((section) => {
          section.classList.remove(...panelClasses)
          const heading = section.querySelector('h2')?.textContent?.trim().toLowerCase() || ''
          if (heading.includes('client location')) section.classList.add('finder-tone-location')
          else if (heading === 'doctors') section.classList.add('finder-tone-doctors')
          else if (heading.includes('plans in')) section.classList.add('finder-tone-results')
          else if (heading.includes('side-by-side comparison')) section.classList.add('finder-tone-compare')
        })
        classifyPlans(root)
        addComparisonActions(root)
      })
    }

    apply()
    const observer = new MutationObserver(apply)
    const root = document.querySelector('.medicare-standalone-content')
    if (root) observer.observe(root, { subtree:true, childList:true, characterData:true })
    window.addEventListener('resize', apply)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', apply) }
  }, [])
  return null
}
