type TableRow = { cells: string[]; html: string }

export type Q1PlanDetails = {
  ambulance_copay: string | null
  emergency_room_copay: string | null
  urgent_care_copay: string | null
  drug_deductible: string | null
  part_b_credit: string | null
  formulary_url: string | null
}

export type Q1DrugMatch = {
  covered: boolean
  source_available: boolean
  drug_name: string
  tier: string | null
  tier_description: string | null
  preferred_30_day: string | null
  mail_90_day: string | null
  utilization_management: string | null
  retail_30_day: number | null
  retail_90_day: number | null
  source_url: string | null
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function cleanHtmlText(value: string) {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' · ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim()
}

function tableRows(html: string): TableRow[] {
  const rows: TableRow[] = []
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = match[1]
    const cells = [...rowHtml.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
      .map((cell) => cleanHtmlText(cell[1]))
      .filter(Boolean)
    if (cells.length) rows.push({ cells, html: rowHtml })
  }
  return rows
}

function rowValue(rows: TableRow[], pattern: RegExp) {
  for (const row of rows) {
    const index = row.cells.findIndex((cell) => pattern.test(cell))
    if (index < 0) continue
    const following = row.cells.slice(index + 1).filter(Boolean).join(' · ')
    if (following) return following
    if (row.cells[index].includes(':')) return row.cells[index].split(':').slice(1).join(':').trim() || null
  }
  return null
}

function absoluteQ1Url(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(decodeEntities(value), 'https://q1medicare.com/')
    if (url.hostname !== 'q1medicare.com' && url.hostname !== 'www.q1medicare.com') return null
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return null
  }
}

async function fetchQ1(url: string) {
  const safe = absoluteQ1Url(url)
  if (!safe) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(safe, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'MayerMedicareFinder/1.0 plan-comparison reference tool'
      },
      signal: controller.signal,
      next: { revalidate: 60 * 60 * 24 * 7 }
    })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function findFormularyUrl(html: string) {
  for (const match of html.matchAll(/href\s*=\s*["']([^"']*PartD-BrowseMedicare-2026PlanFormulary\.php[^"']*)["']/gi)) {
    const url = absoluteQ1Url(match[1])
    if (url) return url
  }
  for (const match of html.matchAll(/href\s*=\s*["']([^"']*MedicareAdvantage-2026MAPDPlanRxCostSharingDetails\.php[^"']*)["']/gi)) {
    const url = absoluteQ1Url(match[1])
    if (url) return url
  }
  return null
}

export async function fetchQ1PlanDetails(sourceUrl: string): Promise<Q1PlanDetails | null> {
  const html = await fetchQ1(sourceUrl)
  if (!html) return null
  const rows = tableRows(html)
  return {
    ambulance_copay: rowValue(rows, /^(ground\s+)?ambulance/i),
    emergency_room_copay: rowValue(rows, /emergency (room|care)/i),
    urgent_care_copay: rowValue(rows, /urgent care/i),
    drug_deductible: rowValue(rows, /annual rx deductible|drug plan deductible|drug deductible/i),
    part_b_credit: rowValue(rows, /part b (premium )?(reduction|rebate|giveback)/i),
    formulary_url: findFormularyUrl(html)
  }
}

function normalizeDrug(value: string) {
  return value
    .toUpperCase()
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/HYDROCHLORIDE/g, ' HCL ')
    .replace(/HCL\b/g, ' HCL ')
    .replace(/EXTENDED[ -]?RELEASE/g, ' ER ')
    .replace(/DELAYED[ -]?RELEASE/g, ' DR ')
    .replace(/24\s*(?:HOUR|HR)/g, ' 24H ')
    .replace(/12\s*(?:HOUR|HR)/g, ' 12H ')
    .replace(/\bORAL\b/g, ' ')
    .replace(/\bSOLUTION\b/g, ' SOLUTION ')
    .replace(/[^A-Z0-9.%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const DRUG_STOP = new Set(['MG', 'MCG', 'GM', 'ML', 'TABLET', 'CAPSULE', 'SOLUTION', 'INJECTION', 'ORAL', 'ER', 'DR', 'IR', '24H', '12H'])

function drugScore(requested: string, candidate: string) {
  const left = normalizeDrug(requested)
  const right = normalizeDrug(candidate)
  if (!left || !right) return 0
  if (left === right) return 1
  if (right.includes(left) || left.includes(right)) return 0.94

  const leftTokens = left.split(' ')
  const rightSet = new Set(right.split(' '))
  const important = leftTokens.filter((token) => !DRUG_STOP.has(token))
  if (!important.length) return 0
  const overlap = important.filter((token) => rightSet.has(token)).length
  const strengthTokens = leftTokens.filter((token) => /^\d+(?:\.\d+)?%?$/.test(token))
  const strengthMatches = strengthTokens.every((token) => rightSet.has(token))
  const ingredientMatches = rightSet.has(important[0])
  const base = overlap / important.length
  return base * (ingredientMatches ? 1 : 0.55) * (strengthMatches ? 1 : 0.72)
}

function firstLetter(value: string) {
  const match = normalizeDrug(value).match(/[A-Z0-9]/)
  return match?.[0] || 'A'
}

function formularyBrowseUrl(formularyUrl: string, drugName: string) {
  const url = new URL(formularyUrl)
  if (/MedicareAdvantage-2026MAPDPlanRxCostSharingDetails/i.test(url.pathname)) {
    url.pathname = '/PartD-BrowseMedicare-2026PlanFormulary.php'
  }
  url.searchParams.set('letter', firstLetter(drugName))
  if (!url.searchParams.get('mode')) url.searchParams.set('mode', 'state')
  url.searchParams.set('sort', 'drugNameasc')
  return url.toString()
}

function money(value: string | null | undefined) {
  if (!value) return null
  const match = value.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)/)
  if (!match) return null
  const amount = Number(match[1])
  return Number.isFinite(amount) ? amount : null
}

function retailPrices(html: string) {
  const text = cleanHtmlText(html)
  const thirty = text.match(/\$\s*([\d,]+(?:\.\d+)?)\*?\s*30-Day Supply/i)
  const ninety = text.match(/\$\s*([\d,]+(?:\.\d+)?)\*?\s*90-Day Supply/i)
  return {
    retail_30_day: thirty ? Number(thirty[1].replace(/,/g, '')) : null,
    retail_90_day: ninety ? Number(ninety[1].replace(/,/g, '')) : null
  }
}

export function costShareAmount(costShare: string | null, negotiatedPrice: number | null) {
  if (!costShare) return null
  const fixed = money(costShare)
  if (fixed !== null) return negotiatedPrice !== null ? Math.min(fixed, negotiatedPrice) : fixed
  const pct = costShare.match(/(\d+(?:\.\d+)?)\s*%/)
  if (pct && negotiatedPrice !== null) return negotiatedPrice * (Number(pct[1]) / 100)
  return null
}

export function deductibleInfo(value: string | null) {
  const amount = money(value) || 0
  const excluded = new Set<number>()
  if (value) {
    for (const match of value.matchAll(/tiers?\s+([0-9,\sand]+?)\s+(?:are\s+)?excluded/gi)) {
      for (const tier of match[1].match(/\d+/g) || []) excluded.add(Number(tier))
    }
    for (const match of value.matchAll(/tier\s+(\d+)\s+(?:is\s+)?excluded/gi)) excluded.add(Number(match[1]))
  }
  return { amount, excluded_tiers: excluded }
}

export async function fetchQ1DrugMatch(formularyUrl: string, requestedDrugName: string): Promise<Q1DrugMatch> {
  const browseUrl = formularyBrowseUrl(formularyUrl, requestedDrugName)
  const html = await fetchQ1(browseUrl)
  if (!html) {
    return { covered: false, source_available: false, drug_name: requestedDrugName, tier: null, tier_description: null, preferred_30_day: null, mail_90_day: null, utilization_management: null, retail_30_day: null, retail_90_day: null, source_url: browseUrl }
  }

  const candidates = tableRows(html)
    .filter((row) => row.cells.length >= 4)
    .map((row) => ({ row, score: drugScore(requestedDrugName, row.cells[0]) }))
    .filter((item) => item.score >= 0.62)
    .sort((a, b) => b.score - a.score)

  const best = candidates[0]
  if (!best) {
    return { covered: false, source_available: true, drug_name: requestedDrugName, tier: null, tier_description: null, preferred_30_day: null, mail_90_day: null, utilization_management: null, retail_30_day: null, retail_90_day: null, source_url: browseUrl }
  }

  const cells = best.row.cells
  const tier = cells[1]?.replace(/[^0-9]/g, '') || null
  const tierDescription = cells[2] || null
  const preferred = cells[3] || null
  const mail = cells[4] || null
  const utilization = cells[5] || null
  const priceHref = [...best.row.html.matchAll(/href\s*=\s*["']([^"']*RetailDrugPrice[^"']*)["']/gi)][0]?.[1]
  const priceUrl = absoluteQ1Url(priceHref)
  let retail_30_day: number | null = null
  let retail_90_day: number | null = null
  if (priceUrl) {
    const priceHtml = await fetchQ1(priceUrl)
    if (priceHtml) ({ retail_30_day, retail_90_day } = retailPrices(priceHtml))
  }

  return {
    covered: true,
    source_available: true,
    drug_name: cells[0] || requestedDrugName,
    tier,
    tier_description: tierDescription,
    preferred_30_day: preferred,
    mail_90_day: mail,
    utilization_management: utilization,
    retail_30_day,
    retail_90_day,
    source_url: priceUrl || browseUrl
  }
}
