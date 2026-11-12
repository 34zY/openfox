import { Router } from 'express'
import {
  listAllMemories,
  searchMemories,
  rememberFact,
  deleteMemory,
  type MemoryType,
  type MemoryScope,
} from '../db/memory.js'

export function createMemoryRoutes(): Router {
  const router = Router()

  router.get('/', (req, res) => {
    const projectId = typeof req.query['projectId'] === 'string' ? req.query['projectId'] : null
    const query = typeof req.query['q'] === 'string' ? req.query['q'] : ''
    const items = query ? searchMemories(query, { projectId, limit: 50 }) : listAllMemories({ projectId })
    res.json({ items })
  })

  router.post('/', (req, res) => {
    const body = req.body as {
      type?: MemoryType
      scope?: MemoryScope
      projectId?: string
      text?: string
      tags?: string
    }
    if (!body.text || !body.type) {
      return res.status(400).json({ error: 'type and text are required' })
    }
    const rec = rememberFact({
      type: body.type,
      scope: body.scope ?? 'project',
      projectId: body.projectId ?? null,
      text: body.text,
      tags: body.tags ?? null,
    })
    res.status(201).json(rec)
  })

  router.delete('/:id', (req, res) => {
    const removed = deleteMemory(req.params['id']!)
    if (!removed) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  })

  return router
}
