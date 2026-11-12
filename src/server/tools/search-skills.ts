/**
 * Search Skills Tool
 *
 * Lets an agent search the full skill library (enabled or not) by keyword
 * before deciding whether a specialized skill applies, instead of relying on
 * the always-injected AVAILABLE SKILLS list (which only shows enabled skills).
 */

import type { ToolResult } from './types.js'
import { createTool, type ToolHandler } from './tool-helpers.js'
import { loadAllSkills } from '../skills/registry.js'
import { getRuntimeConfig } from '../runtime-config.js'
import { getGlobalConfigDir } from '../../cli/paths.js'

interface SearchSkillsArgs {
  query: string
}

const handler: ToolHandler<SearchSkillsArgs> = async (args, context, helpers): Promise<ToolResult> => {
  const { query } = args
  if (!query || !query.trim()) {
    return helpers.error('Missing required parameter: query')
  }

  const config = getRuntimeConfig()
  const configDir = getGlobalConfigDir(config.mode ?? 'production')
  const allSkills = await loadAllSkills(configDir, context.sessionManager.getProjectWorkdir(context.sessionId))

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const scored = allSkills
    .map((skill) => {
      const haystack = `${skill.metadata.id} ${skill.metadata.name} ${skill.metadata.description}`.toLowerCase()
      const score = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0)
      return { skill, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  if (scored.length === 0) {
    return helpers.success(`No skill matches "${query}". Proceed without a skill, or try a different keyword.`)
  }

  const listing = scored.map(({ skill }) => `- **${skill.metadata.id}** - ${skill.metadata.description}`).join('\n')

  return helpers.success(
    `Matching skills for "${query}":\n${listing}\n\nCall load_skill with the exact id to load one. Load at most one unless the task genuinely needs more than one.`,
  )
}

export const searchSkillsTool = createTool<SearchSkillsArgs>(
  'search_skills',
  {
    type: 'function',
    function: {
      name: 'search_skills',
      description:
        'Search the full skill library by keyword before deciding whether a specialized skill applies to the current task. Returns matching skill ids and descriptions. Call this whenever a task touches an unfamiliar API, file format, or workflow, BEFORE calling load_skill. Never guess a skill id blind.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keyword(s) describing the task or domain, e.g. "airtable api" or "pdf extraction"',
          },
        },
        required: ['query'],
      },
    },
  },
  handler,
)
