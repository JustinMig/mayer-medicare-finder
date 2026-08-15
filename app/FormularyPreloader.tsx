'use client'

import { useEffect, useRef, useState } from 'react'

type Status = {
  total_plans: number
  drug_count: number
  cached_pairs: number
  complete_plans: number
  partial_plans: number
  error_plans: number
  attempted_plans: number
  finished_cycle: boolean
  fully_preloaded: boolean
  processed_plan?: string
  warning?: string
  error?: string
}

export default function FormularyPreloader() {
  const [status, setStatus] = useState<Status | null>(null)
  const [active, setActive] = useState(false)
  const stopped = useRef(false)

  useEffect(() => {
    stopped.current = false
    async function run() {
      try {
        const first = await fetch('/api/formulary-preload', { cache: 'no-store' })
        const initial = await first.json() as Status
        if (!first.ok) throw new Error(initial.error || 'Unable to check medication cache.')
        if (stopped.current) return
        setStatus(initial)
        if (initial.finished_cycle) return
        setActive(true)

        let current = initial
        while (!stopped.current && !current.finished_cycle) {
          if (document.visibilityState === 'hidden') {
            await new Promise((resolve) => setTimeout(resolve, 1500))
            continue
          }
          const response = await fetch('/api/formulary-preload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          current = await response.json() as Status
          if (!response.ok) throw new Error(current.error || 'Medication cache preload failed.')
          if (stopped.current) return
          setStatus(current)
          await new Promise((resolve) => setTimeout(resolve, 350))
        }
      } catch (error) {
        if (!stopped.current) setStatus((current) => ({ ...(current || { total_plans: 0, drug_count: 0, cached_pairs: 0, complete_plans: 0, partial_plans: 0, error_plans: 0, attempted_plans: 0, finished_cycle: true, fully_preloaded: false }), error: error instanceof Error ? error.message : 'Medication cache preload unavailable.' }))
      } finally {
        if (!stopped.current) setActive(false)
      }
    }
    run()
    return () => { stopped.current = true }
  }, [])

  if (!status || (!active && status.fully_preloaded)) return null
  const done = Math.min(status.total_plans, status.attempted_plans)
  const tone = status.error || status.error_plans || status.partial_plans ? 'warning' : status.finished_cycle ? 'ready' : 'working'
  return (
    <div className={`formulary-preload-banner formulary-preload-${tone}`} role="status" aria-live="polite">
      <strong>{status.finished_cycle ? 'Medication cache ready' : 'Optimizing medication comparisons'}</strong>
      <span>{status.total_plans ? `${done}/${status.total_plans} plans · ${status.drug_count} medications · ${status.cached_pairs} plan/drug matches cached` : 'Checking plan formularies…'}</span>
      {status.processed_plan && !status.finished_cycle ? <small>Last: {status.processed_plan}</small> : null}
      {status.partial_plans || status.error_plans ? <small>{status.partial_plans} partial · {status.error_plans} need live lookup</small> : null}
      {status.error ? <small>{status.error}</small> : null}
    </div>
  )
}
