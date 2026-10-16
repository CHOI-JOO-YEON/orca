import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { StructuredAgentId } from '../../shared/agent-session-provider-handle'
import {
  adoptsCliConversations,
  CLI_CONVERSATION_ADOPTING_AGENTS
} from '../../shared/structured-agent-cli-conversation-adoption'
import { agentSessionRefusalError } from '../../shared/agent-session-wire-refusals'
import type { CliWriterObservation } from '../agent-hooks/server/cli-writer-observation'
import { getFreshShellForegroundSnapshot } from '../../shared/process-table-snapshot-reader'
import { collectDescendantsFromIndex, getProcessTableIndex } from '../../shared/process-table-index'
import { isShellProcess } from '../../shared/shell-process-detection'

export type CliWriterPane = { ptyId: string; identity: string }
export type CliWriterHost = {
  rows: () => AgentStatusIpcPayload[]
  observation: (row: AgentStatusIpcPayload) => CliWriterObservation | null
  pane: (row: AgentStatusIpcPayload) => CliWriterPane | null
  sleeping: (workspaceId: string) => boolean
  shellAlone: (pane: CliWriterPane) => Promise<boolean>
}

/** Unlike foreground ownership, an empty subtree excludes background and suspended writers too. */
export async function posixCliWriterShellAlone(rootPid: number): Promise<boolean> {
  const index = getProcessTableIndex(await getFreshShellForegroundSnapshot())
  const root = index.byPid.get(rootPid)
  const executable = root?.command.trim().replace(/^-/, '').split(/\s+/, 1)[0] ?? ''
  return !!root && isShellProcess(executable) && root.stat.includes('+') &&
    collectDescendantsFromIndex(index, rootPid).length === 0
}

/** Execution-host observations release a terminal writer; loss of evidence never does. */
export async function assertCliConversationWritersExited(
  host: CliWriterHost,
  agent: StructuredAgentId,
  providerSessionId: string
): Promise<void> {
  const refuse = () =>
    agentSessionRefusalError('agent_session_conflict', { reason: 'conversationHeldElsewhere' })
  try {
    const rows = host.rows().filter(
      (row) => !row.connectionId && !row.structuredHost &&
        adoptsCliConversations(row.agentType) &&
        CLI_CONVERSATION_ADOPTING_AGENTS[row.agentType] === agent &&
        row.providerSession?.id === providerSessionId
    )
    for (const row of rows) {
      const observed = host.observation(row)
      if (!observed || !observed.current() || observed.topology !== 'pane-owned' ||
        host.sleeping(row.worktreeId ?? '')) {
        throw refuse()
      }
      const pane = host.pane(row)
      const presence = await observed.presence()
      if (!observed.current() || presence === 'live' || presence === 'unverifiable' ||
        (pane && host.pane(row)?.identity !== pane.identity)) {
        throw refuse()
      }
      if (presence === 'exited') {
        continue
      }
      if (!pane || !(await host.shellAlone(pane)) || !observed.current() ||
        host.pane(row)?.identity !== pane.identity || host.sleeping(row.worktreeId ?? '')) {
        throw refuse()
      }
    }
  } catch {
    throw refuse()
  }
}
