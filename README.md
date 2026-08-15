# Mayer Medicare Plan Finder

Standalone Next.js application separated from Mayer Insurance CRM.

## What is included
- Secure Supabase email/password login
- Mississippi 2026 Medicare Advantage plan finder
- Plan comparison + Show Differences Only
- Vision, eyewear, hearing exam, and hearing aid display
- Doctor autocomplete by ZIP/radius
- Exact doctor office selection
- Live/carrier-backed network verification where connected
- Only In-Network Doctors filter
- Commissionable-only plan results
- Shared Supabase plan/provider data with the CRM

## What is intentionally NOT included
- CRM dashboard
- Client records
- New-client intake
- SOA / documents
- Website leads
- Life insurance tools
- CRM notification features

## Required Vercel environment variables
Copy the same values already used by the CRM project:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (recommended; server-only)

The code also accepts `SUPABASE_SERVICE_ROLE_KEY` as a legacy server-only alternative.

Never prefix the secret/service-role key with `NEXT_PUBLIC_`.

## Recommended production URL
`https://medicare.mayerig.com`

## Deployment order
1. Create a new GitHub repo named `Mayer-medicare-finder`.
2. Upload the contents of this ZIP to the repo root.
3. In Vercel, create a NEW project and import `Mayer-medicare-finder`.
4. Add the required environment variables before production use.
5. Deploy and verify the Vercel URL first.
6. Add `medicare.mayerig.com` to the new Vercel project.
7. Only after the standalone site is verified should the CRM Medicare navigation be changed to the new domain.

## Important
This app intentionally uses the SAME Supabase project/database as the CRM. Do not create a second Supabase database for this split.
