import type { TuiAgent } from '../../../../shared/tui-agent'
import type { HostChatAnswer } from '@/lib/new-tab-agent-menu-rows'

/** A host verdict, or `unanswered` once a read could not get one in time. */
export type RecordedHostChatAnswer = HostChatAnswer | 'unanswered'

// Why module scope: every tab group's + menu on one workspace host shares what that host said.
const answersByOwner = new Map<string, Map<TuiAgent, RecordedHostChatAnswer>>()
const listeners = new Set<() => void>()
let version = 0
const MAX_OWNERS = 32

export function readHostChatAnswer(
  ownerKey: string,
  agent: TuiAgent
): RecordedHostChatAnswer | undefined {
  return answersByOwner.get(ownerKey)?.get(agent)
}

export function recordHostChatAnswer(
  ownerKey: string,
  agent: TuiAgent,
  answer: RecordedHostChatAnswer
): void {
  const answers = answersByOwner.get(ownerKey) ?? new Map<TuiAgent, RecordedHostChatAnswer>()
  // A read that could not answer never replaces a verdict the host already gave.
  if (answer === 'unanswered' && answers.has(agent)) {
    return
  }
  answersByOwner.delete(ownerKey)
  answersByOwner.set(ownerKey, answers.set(agent, answer))
  for (const stale of [...answersByOwner.keys()].slice(0, -MAX_OWNERS)) {
    answersByOwner.delete(stale)
  }
  version += 1
  listeners.forEach((listener) => listener())
}

export function subscribeHostChatAnswers(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function hostChatAnswersVersion(): number {
  return version
}
