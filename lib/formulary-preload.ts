type TableRow = { cells: string[] }

type DrugInput = { id: string; rxcui: string; drug_name: string }

export type PreloadDrugMatch = DrugInput & {
  source_available: boolean
  covered: boolean
  tier: string | null
  tier_description: string | null
  preferred_30_day: string | null
  mail_90_day: string | null
  utilization_management: string | null
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
  return decodeEntities(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function tableRows(html: string): TableRow[] {
  const rows: TableRow[] = []
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((cell) => cleanHtmlText(cell[1])).filter(Boolean)
    if (cells.length) rows.push({ cells })
  }
  return rows
}

function normalizeDrug(value: string) {
  return value.toUpperCase().replace(/\[[^\]]*]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/HYDROCHLORIDE/g, ' HCL ').replace(/HCL\b/g, ' HCL ').replace(/EXTENDED[ -]?RELEASE/g, ' ER ').replace(/DELAYED[ -]?RELEASE/g, ' DR ').replace(/24\s*(?:HOUR|HR)/g, ' 24H ').replace(/12\s*(?:HOUR|HR)/g, ' 12H ').replace(/\bORAL\b/g, ' ').replace(/[^A-Z0-9.%]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const STOP = new Set(['MG','MCG','GM','ML','TABLET','CAPSULE','SOLUTION','INJECTION','ORAL','ER','DR','IR','24H','12H'])

function drugScore(requested: string, candidate: string) {
  const left = normalizeDrug(requested); const right = normalizeDrug(candidate)
  if (!left || !right) return 0
  if (left === right) return 1
  if (right.includes(left) || left.includes(right)) return 0.94
  const leftTokens = left.split(' '); const rightSet = new Set(right.split(' ')); const important = leftTokens.filter((token) => !STOP.has(token))
  if (!important.length) return 0
  const overlap = important.filter((token) => rightSet.has(token)).length
  const strengths = leftTokens.filter((token) => /^\d+(?:\.\d+)?%?$/.test(token))
  const strengthMatches = strengths.every((token) => rightSet.has(token)); const ingredientMatches = rightSet.has(important[0]); const base = overlap / important.length
  return base * (ingredientMatches ? 1 : 0.55) * (strengthMatches ? 1 : 0.72)
}

function firstLetter(value: string) { return normalizeDrug(value).match(/[A-Z0-9]/)?.[0] || 'A' }

function safeQ1(value: string) {
  try { const url = new URL(value, 'https://q1medicare.com/'); if (!['q1medicare.com','www.q1medicare.com'].includes(url.hostname)) return null; url.protocol = 'https:'; return url }
  catch { return null }
}

function browseUrl(formularyUrl: string, letter: string) {
  const url = safeQ1(formularyUrl); if (!url) return null
  if (/MedicareAdvantage-2026MAPDPlanRxCostSharingDetails/i.test(url.pathname)) url.pathname = '/PartD-BrowseMedicare-2026PlanFormulary.php'
  url.searchParams.set('letter', letter); if (!url.searchParams.get('mode')) url.searchParams.set('mode', 'state'); url.searchParams.set('sort', 'drugNameasc')
  return url.toString()
}

async function fetchPage(url: string) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
      },
      signal: controller.signal,
      cache: 'no-store'
    })
    return response.ok ? await response.text() : null
  }
  catch { return null } finally { clearTimeout(timer) }
}

export async function preloadFormularyDrugs(formularyUrl: string, drugs: DrugInput[]) {
  const byLetter = new Map<string, DrugInput[]>()
  for (const drug of drugs) { const letter = firstLetter(drug.drug_name); byLetter.set(letter, [...(byLetter.get(letter) || []), drug]) }
  const output: PreloadDrugMatch[] = []
  const entries = [...byLetter.entries()]
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++; if (index >= entries.length) return
      const [letter, letterDrugs] = entries[index]; const url = browseUrl(formularyUrl, letter); const html = url ? await fetchPage(url) : null
      if (!html) { output.push(...letterDrugs.map((drug) => ({ ...drug, source_available: false, covered: false, tier: null, tier_description: null, preferred_30_day: null, mail_90_day: null, utilization_management: null }))); continue }
      const rows = tableRows(html).filter((row) => row.cells.length >= 4)
      for (const drug of letterDrugs) {
        const best = rows.map((row) => ({ row, score: drugScore(drug.drug_name, row.cells[0]) })).filter((item) => item.score >= 0.62).sort((a,b) => b.score - a.score)[0]
        if (!best) { output.push({ ...drug, source_available: true, covered: false, tier: null, tier_description: null, preferred_30_day: null, mail_90_day: null, utilization_management: null }); continue }
        const cells = best.row.cells
        output.push({ ...drug, source_available: true, covered: true, tier: cells[1]?.replace(/[^0-9]/g, '') || null, tier_description: cells[2] || null, preferred_30_day: cells[3] || null, mail_90_day: cells[4] || null, utilization_management: cells[5] || null })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, entries.length || 1) }, () => worker()))
  return output
}
