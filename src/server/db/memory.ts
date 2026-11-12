import { randomUUID } from 'node:crypto'
import { getDatabase } from './index.js'

export type MemoryType = 'fact' | 'correction' | 'project' | 'reference'
export type MemoryScope = 'global' | 'project'

export interface MemoryRecord {
  id: string
  type: MemoryType
  scope: MemoryScope
  projectId: string | null
  text: string
  tags: string | null
  createdAt: string
  updatedAt: string
}

interface MemoryRow {
  id: string
  type: string
  scope: string
  project_id: string | null
  text: string
  tags: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    type: row.type as MemoryType,
    scope: row.scope as MemoryScope,
    projectId: row.project_id,
    text: row.text,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function rememberFact(input: {
  type: MemoryType
  scope: MemoryScope
  projectId?: string | null
  text: string
  tags?: string | null
}): MemoryRecord {
  const db = getDatabase()
  const now = new Date().toISOString()
  const id = randomUUID()
  const projectId = input.scope === 'project' ? (input.projectId ?? null) : null
  db.prepare(
    `INSERT INTO memories (id, type, scope, project_id, text, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.type, input.scope, projectId, input.text, input.tags ?? null, now, now)
  return {
    id,
    type: input.type,
    scope: input.scope,
    projectId,
    text: input.text,
    tags: input.tags ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

export function searchMemories(
  query: string,
  opts: { projectId?: string | null; limit?: number } = {},
): MemoryRecord[] {
  const db = getDatabase()
  const limit = opts.limit ?? 8
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '')}"*`)
  if (terms.length === 0) return listRecentMemories(opts)

  const match = terms.join(' OR ')
  const rows = db
    .prepare(
      `SELECT m.* FROM memories m
       JOIN memories_fts f ON f.rowid = m.rowid
       WHERE memories_fts MATCH ?
         AND (m.scope = 'global' OR m.project_id = ?)
       ORDER BY rank
       LIMIT ?`,
    )
    .all(match, opts.projectId ?? null, limit) as MemoryRow[]
  return rows.map(mapRow)
}

export function listRecentMemories(opts: { projectId?: string | null; limit?: number } = {}): MemoryRecord[] {
  // The system prompt is also built where no database is open (unit tests,
  // early init): there are simply no memories to inject then.
  let db: ReturnType<typeof getDatabase>
  try {
    db = getDatabase()
  } catch {
    return []
  }
  const limit = opts.limit ?? 8
  const rows = db
    .prepare(
      `SELECT * FROM memories
       WHERE scope = 'global' OR project_id = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(opts.projectId ?? null, limit) as MemoryRow[]
  return rows.map(mapRow)
}

export function listAllMemories(opts: { projectId?: string | null } = {}): MemoryRecord[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT * FROM memories
       WHERE scope = 'global' OR project_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(opts.projectId ?? null) as MemoryRow[]
  return rows.map(mapRow)
}

export function deleteMemory(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare(`DELETE FROM memories WHERE id = ?`).run(id)
  return result.changes > 0
}
