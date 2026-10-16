import type { AgentProcessVerdict } from '../../../shared/agent-process-presence'
import type { AgentHookEventPayload } from '../../../shared/agent-hook-listener/listener-event'
import type { AgentHookSource } from '../../../shared/agent-hook-relay'

// Symbols survive local row copies but cannot enter JSON persistence or a wire projection.
export const OPEN_CODE_WRITER_TOPOLOGY = Symbol('openCodeWriterTopology')

export type CliWriterObservation = {
  current: () => boolean
  presence: () => Promise<AgentProcessVerdict | null>
  topology: 'pane-owned' | 'shared' | 'unverifiable'
}

export function retainOpenCodeWriterTopology(
  event: AgentHookEventPayload | null,
  source: AgentHookSource,
  body: unknown
): void {
  if (!event || (source !== 'opencode' && source !== 'mimo-code') || !body || typeof body !== 'object') {
    return
  }
  const major = 'opencodeMajor' in body ? body.opencodeMajor : undefined
  const topology = typeof major === 'number' && major >= 2 ? 'pane-owned' :
    ('opencodeSharedServer' in body && body.opencodeSharedServer === 1) ||
    ('opencodeTui' in body && body.opencodeTui === 1) ? 'shared' : 'unverifiable'
  Object.assign(event, { [OPEN_CODE_WRITER_TOPOLOGY]: topology })
}
