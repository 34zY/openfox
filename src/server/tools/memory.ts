/**
 * Memory Tool
 *
 * Lets an agent persist and recall facts/corrections across sessions, so the
 * same mistake or clarified preference doesn't need to be relearned every time.
 */

import type { ToolResult } from './types.js'
import { createTool, type ToolHandler, validateAction } from './tool-helpers.js'
import { rememberFact, searchMemories, deleteMemory, type MemoryType } from '../db/memory.js'

interface MemoryArgs {
  action: 'remember' | 'recall' | 'forget'
  type?: MemoryType
  scope?: 'global' | 'project'
  text?: string
  tags?: string
  query?: string
  id?: string
}

const handler: ToolHandler<MemoryArgs> = async (args, context, helpers): Promise<ToolResult> => {
  const startTime = Date.now()
  const actionError = validateAction(args.action, ['remember', 'recall', 'forget'], startTime)
  if (actionError) return actionError

  const projectId = context.sessionManager.getSession(context.sessionId)?.projectId ?? null

  if (args.action === 'remember') {
    if (!args.text || !args.type) return helpers.error('remember requires "type" and "text"')
    const rec = rememberFact({
      type: args.type,
      scope: args.scope ?? 'project',
      projectId,
      text: args.text,
      tags: args.tags ?? null,
    })
    return helpers.success(`Remembered (${rec.type}/${rec.scope}): ${rec.text}`)
  }

  if (args.action === 'recall') {
    if (!args.query) return helpers.error('recall requires "query"')
    const results = searchMemories(args.query, { projectId })
    if (results.length === 0) return helpers.success('No matching memory.')
    const listing = results.map((r) => `- [${r.id}] (${r.type}/${r.scope}) ${r.text}`).join('\n')
    return helpers.success(listing)
  }

  // forget
  if (!args.id) return helpers.error('forget requires "id" (from a prior recall)')
  const removed = deleteMemory(args.id)
  return removed ? helpers.success('Forgotten.') : helpers.error('No memory with that id.')
}

export const memoryTool = createTool<MemoryArgs>(
  'memory',
  {
    type: 'function',
    function: {
      name: 'memory',
      description:
        'Persist and recall facts across sessions to avoid repeating mistakes. Use "remember" ONLY when the user explicitly corrects you or confirms a non-obvious approach worked, not on every turn. Use "recall" to check for relevant past corrections before acting on an ambiguous or previously-gotten-wrong task. Types: "correction" (user said "no, do X instead"), "fact" (a stable truth about the project/environment), "project" (an ongoing decision or constraint), "reference" (a pointer to an external resource). Scope "global" applies across all projects; "project" is scoped to the current one.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['remember', 'recall', 'forget'] },
          type: { type: 'string', enum: ['fact', 'correction', 'project', 'reference'] },
          scope: { type: 'string', enum: ['global', 'project'] },
          text: { type: 'string', description: 'The fact or correction to remember (for action=remember)' },
          tags: { type: 'string', description: 'Optional space-separated keywords to help future recall' },
          query: { type: 'string', description: 'Keyword(s) to search for (for action=recall)' },
          id: { type: 'string', description: 'Memory id to delete (for action=forget, from a prior recall result)' },
        },
        required: ['action'],
      },
    },
  },
  handler,
)
