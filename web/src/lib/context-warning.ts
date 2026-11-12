/**
 * Models whose context window is below this threshold cannot fit OpenFox's
 * base prompt (system prompt + tools + agent reminder, roughly 8-12k tokens)
 * plus any history, so the provider silently truncates and drops the user's
 * message. Warn the user so they can raise the value in the edit-model modal.
 */
export const MIN_CONTEXT_WARNING = 16384

export function isSmallContext(contextWindow: number): boolean {
  return contextWindow < MIN_CONTEXT_WARNING
}

/**
 * Chars-per-token used to pre-flight a message against the model's context
 * window before sending. Calibrated against a real incident (a 309,537-char
 * paste that the backend tokenized at up to 247,255 tokens, ~1.8 real
 * chars/token): the usual chars/4 prose heuristic would have silently let it
 * through. Deliberately conservative (overestimates tokens) so the guard
 * never under-blocks a message the provider would reject anyway.
 */
const CHARS_PER_TOKEN_ESTIMATE = 2

/**
 * True if `content` alone — ignoring any prior conversation history — would
 * already exceed `contextWindow`. Catches the case a single oversized paste
 * can never recover from (retrying can't shrink the prompt), before it ever
 * reaches the provider and triggers a doomed retry loop.
 */
export function wouldOverflowContext(content: string, contextWindow: number | undefined): boolean {
  if (!contextWindow || !content) return false
  return Math.floor(content.length / CHARS_PER_TOKEN_ESTIMATE) >= contextWindow
}
