// Routed through jev-logger's :8091 forward (not :8090 direct) so every call
// lands in ~/jev-decisions.jsonl, same log the dashboard's d3-mini stats read.
const D3MINI_URL = 'http://127.0.0.1:8091/v1/systemone'
const TIMEOUT_MS = 1500

const EXEC_DANGER_CRITERIA = {
  safe: 'harmless read-only command',
  reversible: 'changes state but undoable',
  destructive: 'irreversible data loss or system damage',
}

export interface D3MiniDangerHint {
  choice: string
  confidence?: number
}

/**
 * Advisory-only exec_danger classification from d3-mini (local classifier, ~15ms,
 * zero decode tokens). Never gates or auto-approves anything — the result is
 * surfaced to the user alongside the existing confirmation prompt so they can
 * weigh it themselves. Returns undefined on any failure (box busy/unreachable),
 * silently, so the confirmation flow is never blocked by this.
 */
export async function getD3MiniDangerHint(command: string): Promise<D3MiniDangerHint | undefined> {
  try {
    const res = await fetch(D3MINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-JEV-Source': 'openfox' },
      body: JSON.stringify({
        state: command,
        questions: { exec_danger: { type: 'choice', criteria: EXEC_DANGER_CRITERIA } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as { answers?: { exec_danger?: { choice?: string; confidence?: number } } }
    const answer = data?.answers?.exec_danger
    if (!answer?.choice) return undefined
    return answer.confidence !== undefined
      ? { choice: answer.choice, confidence: answer.confidence }
      : { choice: answer.choice }
  } catch {
    return undefined
  }
}
