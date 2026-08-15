import Link from 'next/link'
import { redirect } from 'next/navigation'
import MedicarePlanFinderProV2 from './MedicarePlanFinderProV2'
import FormularyPreloader from './FormularyPreloader'
import FinderVisualEnhancer from './FinderVisualEnhancer'
import MedicareWorkspace from './MedicareWorkspace'
import './finder-polish.css'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function MedicareFinderHome({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')

  const params = searchParams ? await searchParams : {}
  const appShell = params.appShell === '1'

  const finder = (
    <>
      <div className="clients-page-heading medicare-page-heading">
        <h1>Medicare Plan Finder</h1>
        <p className="subtle">Compare Mississippi Medicare Advantage plans by benefits, doctors, pharmacy, medications, and estimated monthly and annual costs.</p>
      </div>
      <FormularyPreloader />
      <FinderVisualEnhancer />
      <MedicarePlanFinderProV2 />
    </>
  )

  return (
    <div className="medicare-standalone-shell">
      <header className="medicare-standalone-topbar">
        <div className="medicare-standalone-brand">
          <img src="/mayer-bear.png" alt="Mayer Insurance Group bear" />
          <div>
            <strong>Mayer Insurance Group</strong>
            <span>Medicare Plan Finder</span>
          </div>
        </div>
        <div className="medicare-standalone-actions">
          <Link className="btn btn-secondary" href="https://crm.mayerig.com">Open CRM</Link>
          <form action="/auth/signout" method="post">
            <button className="btn btn-secondary" type="submit">Sign out</button>
          </form>
        </div>
      </header>

      <main className="medicare-standalone-content">
        {appShell ? finder : <MedicareWorkspace>{finder}</MedicareWorkspace>}
      </main>
    </div>
  )
}
