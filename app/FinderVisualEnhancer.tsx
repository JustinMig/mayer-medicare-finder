'use client'

import { useEffect } from 'react'

const panelClasses = ['finder-tone-location','finder-tone-doctors','finder-tone-medications','finder-tone-pharmacy','finder-tone-results','finder-tone-compare']

export default function FinderVisualEnhancer() {
  useEffect(() => {
    let frame = 0
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
