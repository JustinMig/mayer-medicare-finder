import Link from 'next/link'
import { redirect } from 'next/navigation'
import MedicarePlanFinderPro from './MedicarePlanFinderPro'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function MedicareFinderHome() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/login')

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
        <div className="clients-page-heading medicare-page-heading">
          <h1>Medicare Plan Finder</h1>
          <p className="subtle">Compare Mississippi Medicare Advantage plans by benefits, doctors, medications, and estimated monthly and annual costs.</p>
        </div>
        <MedicarePlanFinderPro />
      </main>
    </div>
  )
}
