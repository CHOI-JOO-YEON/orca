import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { AgentProcessVerdict } from '../../shared/agent-process-presence'
import type { CliWriterObservation } from '../agent-hooks/server/cli-writer-observation'
import { assertCliConversationWritersExited, posixCliWriterShellAlone, type CliWriterHost } from './structured-agent-cli-writers'

const snapshot = vi.hoisted(() => vi.fn())
vi.mock('../../shared/process-table-snapshot-reader', () => ({ getFreshShellForegroundSnapshot: snapshot }))

const row: AgentStatusIpcPayload = {
  paneKey: 'source', worktreeId: 'workspace', connectionId: null,
  agentType: 'codex', receivedAt: 1, stateStartedAt: 1, state: 'done', prompt: '',
  providerSession: { key: 'session_id', id: 'conversation' }
}
function inspection(verdict: AgentProcessVerdict | null = null) {
  let current = true
  let identity = 'original-pty'
  const observation: CliWriterObservation = {
    current: () => current, topology: 'pane-owned', presence: vi.fn(async () => verdict)
  }
  const host: CliWriterHost = {
    rows: () => [row], observation: () => observation,
    pane: () => ({ ptyId: 'pty', identity }), sleeping: () => false,
    shellAlone: vi.fn(async () => true)
  }
  return {
    host, observation,
    replaceRow: () => { current = false },
    replacePty: () => { identity = 'replacement-pty' },
    run: () => assertCliConversationWritersExited(host, 'codex', 'conversation')
  }
}
const refusal = { refusal: { code: 'agent_session_conflict', details: { reason: 'conversationHeldElsewhere' } } }

beforeEach(() => vi.clearAllMocks())
describe('execution-host conversation writer inspection', () => {
  it('refuses live writers even with a foreground shell and retains suspended background children', async () => {
    const live = inspection('live')
    await expect(live.run()).rejects.toMatchObject(refusal)
    expect(live.host.shellAlone).not.toHaveBeenCalled()
    for (const stat of ['S', 'T']) {
      snapshot.mockResolvedValue([
        { pid: 10, ppid: 1, stat: 'Ss+', command: '/bin/zsh' },
        { pid: 11, ppid: 10, stat, command: 'custom-agent-alias' }
      ])
      expect(await posixCliWriterShellAlone(10)).toBe(false)
    }
    snapshot.mockResolvedValue([{ pid: 10, ppid: 1, stat: 'Ss+', command: '/bin/zsh' }])
    expect(await posixCliWriterShellAlone(10)).toBe(true)
  })

  it('accepts exact exited or unchanged shell-only proof, never loss of evidence', async () => {
    await expect(inspection('unverifiable').run()).rejects.toMatchObject(refusal)
    await expect(inspection('exited').run()).resolves.toBeUndefined()
    await expect(inspection().run()).resolves.toBeUndefined()
    for (const cause of ['missing-pane', 'missing-row', 'sleeping', 'failed-scan', 'shared-server', 'unknown-topology'] as const) {
      const check = inspection()
      if (cause === 'missing-pane') {
        check.host.pane = () => null
      }
      if (cause === 'missing-row') {
        check.host.observation = () => null
      }
      if (cause === 'sleeping') {
        check.host.sleeping = () => true
      }
      if (cause === 'failed-scan') {
        check.host.rows = () => {
          throw new Error('unavailable')
        }
      }
      if (cause === 'shared-server') {
        check.observation.topology = 'shared'
      }
      if (cause === 'unknown-topology') {
        check.observation.topology = 'unverifiable'
      }
      await expect(check.run()).rejects.toMatchObject(refusal)
    }
  })

  it('refuses replaced conversation observations or terminal incarnations across awaits', async () => {
    for (const replace of ['row', 'pty'] as const) {
      const check = inspection('exited')
      check.observation.presence = async () => {
        if (replace === 'row') {
          check.replaceRow()
        } else {
          check.replacePty()
        }
        return 'exited'
      }
      await expect(check.run()).rejects.toMatchObject(refusal)
    }
  })
})
