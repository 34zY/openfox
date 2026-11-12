import type { Tool, ToolContext } from '../tools/types.js'
import type { McpManager } from './manager.js'
import { getSessionDisabledServers } from './session-overrides.js'
import { sanitizeToolSchema } from '../llm/schema-sanitizer.js'

/** Keep large catalogs available without sending every schema to every LLM turn. */
export function createMcpDiscoveryTools(manager: McpManager): Tool[] {
  const serversFor = (context: ToolContext) => {
    const disabled = new Set(getSessionDisabledServers(context.sessionId))
    return manager.getAllServers().filter((s) => !s.config.disabled && !disabled.has(s.name))
  }
  return [
    {
      name: 'mcp_list_tools',
      definition: {
        type: 'function',
        function: {
          name: 'mcp_list_tools',
          description:
            'Discover MCP servers and tools. Without serverName, list servers. With serverName, search and paginate its tools, returning exact input schemas. Use this before mcp_call_tool. All enabled MCP tools remain available.',
          parameters: {
            type: 'object',
            properties: {
              serverName: { type: 'string' },
              query: { type: 'string' },
              offset: { type: 'integer', minimum: 0 },
              limit: { type: 'integer', minimum: 1, maximum: 25 },
            },
            additionalProperties: false,
          },
        },
      },
      execute: async (args, context) => {
        const servers = serversFor(context)
        if (!args['serverName']) {
          return {
            success: true,
            output: JSON.stringify({
              servers: servers.map((s) => ({
                name: s.name,
                status: s.status,
                tools: s.tools.filter((t) => t.enabled).length,
              })),
            }),
            durationMs: 0,
            truncated: false,
          }
        }
        const server = servers.find((s) => s.name === args['serverName'])
        if (!server)
          return {
            success: false,
            error: 'MCP server unavailable or disabled for this session',
            durationMs: 0,
            truncated: false,
          }
        const query = String(args['query'] ?? '').toLowerCase()
        const offset =
          typeof args['offset'] === 'number' && Number.isInteger(args['offset']) ? Math.max(0, args['offset']) : 0
        const limit =
          typeof args['limit'] === 'number' && Number.isInteger(args['limit'])
            ? Math.max(1, Math.min(25, args['limit']))
            : 10
        const matches = server.tools.filter(
          (t) => t.enabled && `${t.name} ${t.description ?? ''}`.toLowerCase().includes(query),
        )
        const tools = matches
          .slice(offset, offset + limit)
          .map((t) => ({ name: t.name, description: t.description, inputSchema: sanitizeToolSchema(t.inputSchema) }))
        return {
          success: true,
          output: JSON.stringify({
            serverName: server.name,
            tools,
            total: matches.length,
            nextOffset: offset + limit < matches.length ? offset + limit : null,
          }),
          durationMs: 0,
          truncated: false,
        }
      },
    },
    {
      name: 'mcp_call_tool',
      definition: {
        type: 'function',
        function: {
          name: 'mcp_call_tool',
          description:
            'Call an enabled MCP tool using the exact serverName, toolName and arguments obtained from mcp_list_tools. Preserves the server result and error. For example serverName=x64dbg, toolName=GetDebugState, arguments={}.',
          parameters: {
            type: 'object',
            properties: {
              serverName: { type: 'string' },
              toolName: { type: 'string' },
              arguments: { type: 'object', additionalProperties: true },
            },
            required: ['serverName', 'toolName', 'arguments'],
            additionalProperties: false,
          },
        },
      },
      execute: async (args, context) => {
        const start = Date.now()
        const server = serversFor(context).find((s) => s.name === args['serverName'])
        const tool = server?.tools.find((t) => t.enabled && t.name === args['toolName'])
        const input = args['arguments']
        if (!server || !tool || !input || typeof input !== 'object' || Array.isArray(input)) {
          return {
            success: false,
            error: 'Unknown/disabled MCP server or tool, or invalid arguments object',
            durationMs: 0,
            truncated: false,
          }
        }
        const result = await manager.callTool(server.name, tool.name, input as Record<string, unknown>)
        return { ...result, durationMs: Date.now() - start, truncated: false }
      },
    },
  ]
}
