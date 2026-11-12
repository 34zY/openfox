import { describe, expect, it, vi } from 'vitest'
import type { McpManager } from './manager.js'
import type { ToolContext } from '../tools/types.js'
import { createMcpDiscoveryTools } from './discovery-adapter.js'
import { createMcpTools } from './tool-adapter.js'

vi.mock('./session-overrides.js', () => ({
  getSessionDisabledServers: (id: string) => (id === 'blocked' ? ['demo'] : []),
}))
const context = { sessionId: 'test' } as ToolContext
function fixture() {
  const callTool = vi.fn().mockResolvedValue({ success: true, output: 'actual server result' })
  const state = {
    name: 'demo',
    status: 'connected',
    config: { transport: 'http' },
    tools: Array.from({ length: 30 }, (_, i) => ({
      name: `read_${i}`,
      description: 'read value',
      enabled: i !== 29,
      inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
    })),
  }
  const manager = { getAllServers: () => [state], callTool } as unknown as McpManager
  const [list, call] = createMcpDiscoveryTools(manager)
  return { list: list!, call: call!, callTool }
}
describe('MCP on-demand discovery', () => {
  it('keeps small catalogs compatible and routes oversized catalogs', () => {
    const state = {
      name: 'demo',
      config: { transport: 'http' },
      tools: [{ name: 'read', description: 'Read', enabled: true, inputSchema: { type: 'object', properties: {} } }],
    }
    const manager = { getAllServers: () => [state] } as unknown as McpManager
    expect(createMcpTools(manager).map((t) => t.name)).toEqual(['demo_read'])
    state.tools[0]!.description = 'x'.repeat(250_001)
    const tools = createMcpTools(manager)
    expect(tools.map((t) => t.name)).toEqual(['mcp_list_tools', 'mcp_call_tool'])
    expect(JSON.stringify(tools.map((t) => t.definition)).length).toBeLessThan(5000)
  })
  it('paginates schemas without exposing disabled tools', async () => {
    const { list } = fixture()
    const first = JSON.parse((await list.execute({ serverName: 'demo', limit: 25 }, context)).output!)
    expect(first.total).toBe(29)
    expect(first.tools).toHaveLength(25)
    expect(first.nextOffset).toBe(25)
    expect(first.tools[0].inputSchema.properties.key.type).toBe('string')
    const last = JSON.parse((await list.execute({ serverName: 'demo', offset: 25 }, context)).output!)
    expect(last.tools).toHaveLength(4)
    expect(last.nextOffset).toBeNull()
  })
  it('respects session-disabled servers for discovery and calls', async () => {
    const { list, call, callTool } = fixture()
    const ctx = { sessionId: 'blocked' } as ToolContext
    expect(JSON.parse((await list.execute({}, ctx)).output!).servers).toEqual([])
    expect((await call.execute({ serverName: 'demo', toolName: 'read_0', arguments: {} }, ctx)).success).toBe(false)
    expect(callTool).not.toHaveBeenCalled()
  })
  it('forwards exact arguments and preserves backend output', async () => {
    const { call, callTool } = fixture()
    const r = await call.execute({ serverName: 'demo', toolName: 'read_0', arguments: { key: 'foo' } }, context)
    expect(callTool).toHaveBeenCalledWith('demo', 'read_0', { key: 'foo' })
    expect(r.output).toBe('actual server result')
  })
  it('blocks unknown, disabled tools and non-object arguments', async () => {
    const { call, callTool } = fixture()
    for (const args of [
      { toolName: 'unknown', arguments: {} },
      { toolName: 'read_29', arguments: {} },
      { toolName: 'read_0', arguments: [] },
    ]) {
      expect((await call.execute({ serverName: 'demo', ...args }, context)).success).toBe(false)
    }
    expect(callTool).not.toHaveBeenCalled()
  })
})
