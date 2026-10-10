import { getSetting, SETTINGS_KEYS } from '../db/settings.js'

// camofox: navigateur anti-bot headless expose en HTTP (/start, /tabs, /tabs/{id}/snapshot).
// Sert de backend furtif pour web_search (DuckDuckGo) et web_fetch (pages proteges anti-bot).
const DEFAULT_CAMOFOX_URL = 'http://192.168.1.63:9377'
const NAV_WAIT_MS = 1500

export function getCamofoxUrl(): string | null {
  return process.env['CAMOFOX_URL'] ?? getSetting(SETTINGS_KEYS.SEARCH_CAMOFOX_URL) ?? null
}

interface SnapshotResponse {
  snapshot?: string
}

interface TabResponse {
  tabId?: string
}

/**
 * Ouvre `targetUrl` dans camofox et renvoie le snapshot d'accessibilite (texte).
 * Nettoie l'onglet dans tous les cas. Jette si camofox injoignable.
 */
export async function camofoxSnapshot(targetUrl: string, signal: AbortSignal): Promise<string> {
  const base = (getCamofoxUrl() ?? DEFAULT_CAMOFOX_URL).replace(/\/+$/, '')
  await fetch(`${base}/start`, { method: 'POST', signal }).catch(() => {})

  const tabRes = await fetch(`${base}/tabs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'openfox', sessionKey: 'openfox', url: targetUrl }),
    signal,
  })
  if (!tabRes.ok) {
    const body = await tabRes.text().catch(() => '')
    throw new Error(`camofox tab failed (${tabRes.status}): ${body}`)
  }
  const { tabId } = (await tabRes.json()) as TabResponse
  if (!tabId) throw new Error('camofox: no tabId returned')

  try {
    await new Promise((r) => setTimeout(r, NAV_WAIT_MS))
    const snapUrl = new URL(`${base}/tabs/${tabId}/snapshot`)
    snapUrl.searchParams.set('userId', 'openfox')
    snapUrl.searchParams.set('sessionKey', 'openfox')
    const snapRes = await fetch(snapUrl.toString(), { signal })
    if (!snapRes.ok) {
      const body = await snapRes.text().catch(() => '')
      throw new Error(`camofox snapshot failed (${snapRes.status}): ${body}`)
    }
    const data = (await snapRes.json()) as SnapshotResponse
    return data.snapshot ?? ''
  } finally {
    const delUrl = new URL(`${base}/tabs/${tabId}`)
    delUrl.searchParams.set('userId', 'openfox')
    void fetch(delUrl.toString(), { method: 'DELETE' }).catch(() => {})
  }
}

const AD_DOMAINS = [
  'booking.com',
  'gites-de-france',
  'expedia',
  'tripadvisor',
  'amazon.',
  'agoda',
  'hotels.com',
  'trivago',
  'kayak',
]

export interface CamofoxResult {
  title: string
  url: string
  content: string
}

/**
 * Parse le snapshot a11y de DuckDuckGo HTML en resultats structures.
 * Un bloc = heading (titre) suivi de links; on prend le link ressemblant a une URL
 * comme url et le link le plus long comme snippet. Jette pubs + chrome DDG.
 */
export function parseDuckduckgo(snapshot: string, maxResults: number): CamofoxResult[] {
  const lines = snapshot.split('\n')
  const results: CamofoxResult[] = []
  let cur: { title: string; links: string[] } | null = null
  let skipAd = false

  const flush = () => {
    if (!cur || !cur.title) return
    const url =
      cur.links.find((l) => /(?:https?:\/\/|\w+\.\w{2,})/.test(l) && !/\s/.test(l.trim())) ??
      cur.links.find((l) => /\w+\.\w{2,}/.test(l)) ??
      ''
    const content = cur.links.filter((l) => l !== url).sort((a, b) => b.length - a.length)[0] ?? ''
    results.push({ title: cur.title, url, content })
    cur = null
  }

  for (const raw of lines) {
    const s = raw.trim()
    if (!s) continue
    const low = s.toLowerCase()
    const heading = s.match(/^-\s*heading\s+"(.+?)"\s*\[level=2\]/i)
    if (heading) {
      flush()
      skipAd = / ad"/i.test(s) || /ad"\s*\[level=2\]/i.test(low)
      if (skipAd) continue
      cur = { title: heading[1]!, links: [] }
      continue
    }
    if (skipAd) continue
    if (!cur) continue
    const link = s.match(/^-\s*link\s+"(.+?)"/i)
    if (link) {
      const txt = link[1]!.trim()
      if (!txt || low.includes('duckduckgo')) continue
      if (AD_DOMAINS.some((d) => txt.toLowerCase().includes(d))) continue
      cur.links.push(txt)
    }
  }
  flush()
  return results.filter((r) => r.title && (r.url || r.content)).slice(0, maxResults)
}
