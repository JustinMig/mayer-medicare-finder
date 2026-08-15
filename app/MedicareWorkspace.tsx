'use client'

import { useState, type ReactNode } from 'react'

type WorkspaceView = 'finder' | 'medicare'

export default function MedicareWorkspace({ children }: { children: ReactNode }) {
  const [view, setView] = useState<WorkspaceView>('finder')
  const [hasOpenedMedicare, setHasOpenedMedicare] = useState(false)

  function showMedicare() {
    setHasOpenedMedicare(true)
    setView('medicare')
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Medicare workspace"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          marginBottom: 16,
          padding: 8,
          border: '1px solid var(--border)',
          borderRadius: 14,
          background: 'rgba(255, 254, 250, .86)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'finder'}
          className={view === 'finder' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => setView('finder')}
        >
          Plan Finder
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'medicare'}
          className={view === 'medicare' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={showMedicare}
        >
          Medicare.gov
        </button>
        <span className="subtle" style={{ marginLeft: 'auto', fontSize: 13 }}>
          Switch between both without leaving this page.
        </span>
      </div>

      <section
        role="tabpanel"
        aria-label="Mayer Medicare Plan Finder"
        hidden={view !== 'finder'}
        style={{ display: view === 'finder' ? 'block' : 'none' }}
      >
        {children}
      </section>

      <section
        role="tabpanel"
        aria-label="Medicare.gov"
        hidden={view !== 'medicare'}
        style={{ display: view === 'medicare' ? 'block' : 'none' }}
      >
        <div
          style={{
            overflow: 'hidden',
            border: '1px solid var(--border)',
            borderRadius: 14,
            background: '#fff',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              background: '#fffefa',
            }}
          >
            <strong>Medicare.gov</strong>
            <a
              className="btn btn-secondary"
              href="https://www.medicare.gov/plan-compare/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Open in new tab
            </a>
          </div>

          {hasOpenedMedicare ? (
            <iframe
              title="Medicare.gov Plan Compare"
              src="https://www.medicare.gov/plan-compare/"
              referrerPolicy="strict-origin-when-cross-origin"
              style={{
                display: 'block',
                width: '100%',
                height: 'calc(100vh - 210px)',
                minHeight: 620,
                border: 0,
                background: '#fff',
              }}
            />
          ) : null}
        </div>
        <p className="subtle" style={{ marginTop: 10, fontSize: 13 }}>
          Medicare.gov is operated by CMS. If CMS blocks embedded viewing in your browser, use “Open in new tab.”
        </p>
      </section>
    </>
  )
}
