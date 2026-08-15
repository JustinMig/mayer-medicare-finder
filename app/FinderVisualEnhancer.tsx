'use client'

import { useEffect } from 'react'

const panelClasses = ['finder-tone-location','finder-tone-doctors','finder-tone-medications','finder-tone-pharmacy','finder-tone-results','finder-tone-compare']

export default function FinderVisualEnhancer() {
  useEffect(() => {
    let frame = 0

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
      footer.dataset.planActions = 'true'
      footer.dataset.signature = signature
      const row = document.createElement('tr')
      row.style.borderTop = '2px solid rgba(15,23,42,.14)'

      const label = document.createElement('th')
      label.textContent = 'Plan documents & details'
      label.style.verticalAlign = 'top'
      label.style.paddingTop = '16px'
      row.appendChild(label)

      planNames.forEach((planName) => {
        const cell = document.createElement('td')
        cell.style.verticalAlign = 'top'
        cell.style.padding = '14px 10px 18px'

        const stack = document.createElement('div')
        stack.style.display = 'grid'
        stack.style.gap = '8px'

        const card = Array.from(root.querySelectorAll('article')).find((article) => article.querySelector('h3')?.textContent?.trim() === planName)
        const originalSummary = card?.querySelector('a[href*="type=summary"]') as HTMLAnchorElement | null
        const originalEoc = card?.querySelector('a[href*="type=eoc"]') as HTMLAnchorElement | null
        const originalBenefits = Array.from(card?.querySelectorAll('button') || []).find((button) => button.textContent?.includes('View Full Plan Benefits')) as HTMLButtonElement | undefined

        const makeButton = (text: string, action: () => void, disabled = false) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.textContent = text
          button.disabled = disabled
          button.style.width = '100%'
          button.style.minHeight = '38px'
          button.style.padding = '8px 10px'
          button.style.borderRadius = '8px'
          button.style.border = '1px solid rgba(15,23,42,.18)'
          button.style.background = disabled ? 'rgba(148,163,184,.12)' : '#fff'
          button.style.color = disabled ? '#94a3b8' : '#0f172a'
          button.style.fontWeight = '700'
          button.style.cursor = disabled ? 'not-allowed' : 'pointer'
          button.style.whiteSpace = 'normal'
          if (!disabled) button.addEventListener('click', action)
          return button
        }

        stack.appendChild(makeButton('Summary of Benefits ↗', () => originalSummary?.click(), !originalSummary))
        stack.appendChild(makeButton('Evidence of Coverage ↗', () => originalEoc?.click(), !originalEoc))
        stack.appendChild(makeButton('View Full Plan Benefits', () => originalBenefits?.click(), !originalBenefits))
        cell.appendChild(stack)
        row.appendChild(cell)
      })

      footer.appendChild(row)
      table.appendChild(footer)
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
          else if (heading === 'medications') section.classList.add('finder-tone-medications')
          else if (heading.includes('pharmacy & prescription')) section.classList.add('finder-tone-pharmacy')
          else if (heading.includes('plans in')) section.classList.add('finder-tone-results')
          else if (heading.includes('side-by-side comparison')) section.classList.add('finder-tone-compare')
        })

        const rows = root.querySelectorAll('table tbody tr')
        rows.forEach((row) => {
          row.classList.remove('finder-pharmacy-row','finder-doctor-row','finder-drug-row','finder-month-row','finder-first-drug-row','finder-first-month-row')
          const label = row.querySelector('th')?.textContent?.trim().toLowerCase() || ''
          if (label.startsWith('pharmacy ·')) row.classList.add('finder-pharmacy-row')
          else if (label.startsWith('doctor ·')) row.classList.add('finder-doctor-row')
          else if (label.startsWith('medication ·')) row.classList.add('finder-drug-row')
          else if (label.includes('prescription estimate')) row.classList.add('finder-month-row')
        })
        root.querySelector('tr.finder-drug-row')?.classList.add('finder-first-drug-row')
        root.querySelector('tr.finder-month-row')?.classList.add('finder-first-month-row')
        addComparisonActions(root)
      })
    }

    apply()
    const observer = new MutationObserver(apply)
    const root = document.querySelector('.medicare-standalone-content')
    if (root) observer.observe(root, { subtree: true, childList: true, characterData: true })
    window.addEventListener('resize', apply)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', apply) }
  }, [])
  return null
}
