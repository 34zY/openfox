import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { Attachment } from '../../shared/types.js'
import { createTool } from './tool-helpers.js'
import { getEventStore } from '../events/index.js'
import { createMessageDoneEvent } from '../chat/stream-pure.js'

interface AttachFileArgs {
  path: string
  description?: string
}

const MAX_TEXT_SIZE = 1024 * 1024 // 1MB for text files
const MAX_BINARY_SIZE = 5 * 1024 * 1024 // 5MB for binary files

// File extension → MIME type mapping
const EXT_TO_MIME: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.ts': 'text/x-typescript',
  '.css': 'text/css',
  '.sh': 'application/x-sh',
  '.bash': 'application/x-sh',
  '.py': 'text/x-python',
  '.java': 'text/x-java-source',
  '.c': 'text/x-c',
  '.h': 'text/x-c',
  '.cpp': 'text/x-c++src',
  '.rs': 'text/x-rustsrc',
  '.go': 'text/x-gosrc',
  '.rb': 'text/x-ruby',
  '.php': 'application/x-httpd-php',
  '.sql': 'application/sql',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

// MIME types that are stored as raw UTF-8 text (not base64 data URL)
const TEXT_MIME_EXACT = [
  'application/json',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/javascript',
  'application/xhtml+xml',
  'application/x-sh',
  'image/svg+xml',
]

function isTextMime(mimeType: string): boolean {
  return mimeType.startsWith('text/') || TEXT_MIME_EXACT.includes(mimeType)
}

function detectMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return EXT_TO_MIME[ext] ?? 'application/octet-stream'
}

/**
 * attach_file tool: lets the agent attach a generated file to the conversation
 * so the user can download it directly, without needing a local HTTP server.
 *
 * The tool reads the file from disk, builds an Attachment object, and emits a
 * standalone assistant message carrying the attachment. The client renders it
 * with a download link.
 */
export const attachFileTool = createTool<AttachFileArgs>(
  'attach_file',
  {
    type: 'function',
    function: {
      name: 'attach_file',
      description:
        'Attach a file to the conversation so the user can download it directly. ' +
        'Use this whenever you generate or produce a file the user needs (reports, documents, images, archives, etc.) ' +
        'instead of starting a local HTTP server to share it. The file is delivered as a downloadable attachment in the chat.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file to attach (relative to workdir or absolute)',
          },
          description: {
            type: 'string',
            description: 'Optional short description of the file (shown to the user)',
          },
        },
        required: ['path'],
      },
    },
  },
  async (args, context, helpers) => {
    const fullPath = helpers.resolvePath(args.path)
    await helpers.checkPathAccess([fullPath])

    // Validate the file exists
    let size: number
    try {
      const stats = await stat(fullPath)
      if (!stats.isFile()) {
        return helpers.error(`Not a file: ${args.path}`)
      }
      size = stats.size
    } catch {
      return helpers.error(`File not found: ${args.path}`)
    }

    if (size === 0) {
      return helpers.error(`File is empty: ${args.path}`)
    }

    const mimeType = detectMimeType(fullPath)
    const isText = isTextMime(mimeType)
    const maxSize = isText ? MAX_TEXT_SIZE : MAX_BINARY_SIZE

    if (size > maxSize) {
      const limitMB = maxSize / (1024 * 1024)
      return helpers.error(
        `File too large (${size} bytes). Maximum is ${limitMB}MB for ${isText ? 'text' : 'binary'} files. ` +
          'For larger files, compress it or split it into smaller parts.',
      )
    }

    // Read the file and build the Attachment
    let data: string
    try {
      if (isText) {
        data = await readFile(fullPath, 'utf-8')
      } else {
        const buffer = await readFile(fullPath)
        data = `data:${mimeType};base64,${buffer.toString('base64')}`
      }
    } catch (error) {
      return helpers.error(`Failed to read file: ${error instanceof Error ? error.message : 'unknown error'}`)
    }

    const filename = basename(fullPath)
    const attachment: Attachment = {
      id: randomUUID(),
      filename,
      mimeType,
      size,
      data,
      ...(args.description ? { description: args.description } : {}),
    }

    // Emit a standalone assistant message carrying the attachment.
    // This is a separate message (not the agent's current message) so it does
    // not interfere with the agent loop's message lifecycle.
    try {
      const eventStore = getEventStore()
      const messageId = randomUUID()
      const content = args.description ? `📎 ${args.description}` : `📎 ${filename}`
      // Build the message.start event manually so we can include the
      // attachment (createMessageStartEvent does not accept attachments).
      eventStore.append(context.sessionId, {
        type: 'message.start',
        data: {
          messageId,
          role: 'assistant',
          content,
          isSystemGenerated: true,
          attachments: [attachment],
        },
      })
      eventStore.append(context.sessionId, createMessageDoneEvent(messageId))
    } catch (error) {
      return helpers.error(
        `File read successfully but failed to emit attachment event: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }

    return helpers.success(
      `Attached ${filename} (${size} bytes, ${mimeType}) to the conversation. The user can now download it directly from the chat.`,
      false,
      {
        metadata: {
          filename,
          mimeType,
          size,
          path: fullPath,
        },
      },
    )
  },
)
