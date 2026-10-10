import { describe, it, expect } from 'vitest'
import { wrapRemote, remoteRoute, type RemoteMount } from './shell.js'

function decodeScript(command: string): string {
  const m = command.match(/echo ([A-Za-z0-9+/=]+) \|/)
  const b64 = m?.[1]
  if (!b64) throw new Error('no base64 payload in: ' + command)
  return Buffer.from(b64, 'base64').toString('utf8')
}

describe('remote workspace routing', () => {
  it('passes local commands through unchanged when no mount matches', () => {
    // No ~/.config/openfox/remote-map.json in the test env -> passthrough.
    const r = remoteRoute('npm test', '/home/user/project')
    expect(r).toEqual({ command: 'npm test', cwd: '/home/user/project' })
  })

  it('wraps a command for the remote host in the mapped path', () => {
    const mount: RemoteMount = { mountPath: '/mnt/win', host: '192.168.1.42', user: 'me', remotePath: '/d/proj' }
    const r = wrapRemote('npm run build', '/mnt/win/app', mount)
    expect(r.command).toContain('ssh ')
    expect(r.command).toContain('me@192.168.1.42')
    expect(r.command).toContain('BatchMode=yes')
    expect(decodeScript(r.command)).toBe("cd '/d/proj/app' && npm run build")
    expect(r.cwd).toBe('/mnt/win/app')
  })

  it('uses the mount root when cwd equals the mount path (trailing slash tolerant)', () => {
    const mount: RemoteMount = { mountPath: '/mnt/win', host: 'h', user: 'u', remotePath: '/d/proj/' }
    const r = wrapRemote('ls -la', '/mnt/win', mount)
    expect(decodeScript(r.command)).toBe("cd '/d/proj' && ls -la")
  })

  it('includes the ssh key and custom shell when provided', () => {
    const mount: RemoteMount = {
      mountPath: '/mnt/win',
      host: 'h',
      user: 'u',
      remotePath: '/w',
      key: '/k/id',
      shell: 'wsl bash -l',
    }
    const r = wrapRemote('pwd', '/mnt/win', mount)
    expect(r.command).toContain("-i '/k/id'")
    expect(r.command).toContain('| wsl bash -l')
  })
})
