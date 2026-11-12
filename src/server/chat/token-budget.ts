import type { RequestContextMessage } from './request-context.js'

/** Rough token estimate: ~4 chars per token, matching the tool-definition estimate in mcp/manager.ts. */
export const CHARS_PER_TOKEN = 4

/** JSON framing overhead per tool message (role, tool_call_id, content key). */
export const TOOL_MESSAGE_OVERHEAD_TOKENS = 16

export function estimateToolResultTokens(toolMessages: Array<Pick<RequestContextMessage, 'content'>>): number {
  return toolMessages.reduce(
    (sum, message) => sum + TOOL_MESSAGE_OVERHEAD_TOKENS + Math.ceil(message.content.length / CHARS_PER_TOKEN),
    0,
  )
}

// llama.cpp phrases the same failure as "context size" / exceed_context_size_error
// (not "context length"), which this pattern missed in production — a single
// oversized paste triggered 400s that this classifier didn't recognize, so the
// halving retry never kicked in and the request looped on the generic backoff
// policy for minutes instead of failing fast.
const CONTEXT_LENGTH_ERROR_PATTERN =
  /context\s*length|context_length|context[\s_]*size|context window|exceed_context_size|prompt (?:is )?too long/i

export function isContextLengthError(message: string | undefined): boolean {
  if (!message) return false
  return CONTEXT_LENGTH_ERROR_PATTERN.test(message)
}
