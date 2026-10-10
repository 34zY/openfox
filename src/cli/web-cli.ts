// CLI headless pour les outils web (search / fetch), sans lancer le serveur ni le navigateur.
// Pilote par variables d'env: CAMOFOX_URL, SEARXNG_URL, TAVILY_API_KEY, SEARCH_ENGINE.
import { webSearchTool } from '../server/tools/web-search.js'
import { webFetchTool } from '../server/tools/web-fetch.js'
import type { ToolContext } from '../server/tools/types.js'

function minimalContext(): ToolContext {
  // web_search / web_fetch n'utilisent que context.signal; le reste est cast pour satisfaire le type.
  return { workdir: process.cwd(), sessionId: 'cli', signal: undefined } as unknown as ToolContext
}

export async function runSearchCommand(
  query: string | undefined,
  opts: { json?: boolean; max?: number },
): Promise<number> {
  if (!query || !query.trim()) {
    console.error('Usage: openfox search "<query>" [--json] [--max N]')
    return 1
  }
  const args: Record<string, unknown> = { query }
  if (opts.max) args['max_results'] = opts.max
  const res = await webSearchTool.execute(args, minimalContext())
  if (!res.success) {
    console.error(res.error ?? 'search failed')
    return 1
  }
  console.log(opts.json ? JSON.stringify(res, null, 2) : (res.output ?? ''))
  return 0
}

export async function runFetchCommand(
  url: string | undefined,
  opts: { json?: boolean; format?: string },
): Promise<number> {
  if (!url || !url.trim()) {
    console.error('Usage: openfox fetch <url> [--format text|markdown|html] [--json]')
    return 1
  }
  const args: Record<string, unknown> = { url }
  if (opts.format) args['format'] = opts.format
  const res = await webFetchTool.execute(args, minimalContext())
  if (!res.success) {
    console.error(res.error ?? 'fetch failed')
    return 1
  }
  console.log(opts.json ? JSON.stringify(res, null, 2) : (res.output ?? ''))
  return 0
}
