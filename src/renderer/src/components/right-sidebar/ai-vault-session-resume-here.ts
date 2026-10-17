import { useAppStore } from '@/store'
import { activateAiVaultStructuredSession } from '@/lib/activate-ai-vault-structured-session'
import { findStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { captureNativeChatComposerFocusIntent } from '@/components/native-chat/use-native-chat-composer-reveal-focus'
import {
  aiVaultHistoryAgents,
  type AiVaultAgent,
  type AiVaultSession
} from '../../../../shared/ai-vault-types'
import { adoptsCliConversations } from '../../../../shared/structured-agent-cli-conversation-adoption'
import { structuredAgentSessionPaneKey } from '../../../../shared/structured-agent-session-projection'
import type { Tab } from '../../../../shared/tab-types'
import type { AiVaultSessionRowChatActions } from './ai-vault-session-chat-action'
import { resumeAiVaultSessionInNewChat } from './ai-vault-session-resume-in-chat-launch'

/** The chat `/resume` was typed in; a picked row's conversation takes its place. */
export type AiVaultResumeHere = {
  tabId: string
  workspaceId: string
  /** The chat's agent; another agent's conversation can't continue in it. */
  agent?: AiVaultAgent
  /** Picking the chat's own conversation only closes the picker. */
  dismiss: () => void
}

/**
 * A tab is one conversation, so "resume here" opens the picked conversation's own chat right after
 * this one and closes this one once that chat exists. False: the row can't take this chat's place.
 */
export function resumeAiVaultSessionHere(args: {
  session: AiVaultSession
  here: AiVaultResumeHere
  actions: Pick<
    AiVaultSessionRowChatActions,
    'canJumpToOriginalPane' | 'resumeInNewChatWorkspaceId'
  >
  jump: (session: AiVaultSession) => void
}): boolean {
  const { session, here, actions } = args
  const structured = session.structuredSession
  if (structured && structured.sessionId === findChatTab(here)?.entityId) {
    here.dismiss()
    return true
  }
  // One conversation never runs in two chats, so one already open is switched to.
  if (actions.canJumpToOriginalPane) {
    args.jump(session)
    return true
  }
  if (!here.agent || !aiVaultHistoryAgents(here.agent).includes(session.agent)) {
    return false
  }
  if (structured) {
    if (structured.workspaceId !== here.workspaceId) {
      return false
    }
    void activateAiVaultStructuredSession(session).then(() => {
      // It also settles true after a reopen it could only report, so only a tab that exists replaces.
      const state = useAppStore.getState()
      if (findStructuredAgentSessionTab(state.unifiedTabsByWorktree, structured)) {
        closeReplacedChat(here)
      }
    })
    return true
  }
  if (
    actions.resumeInNewChatWorkspaceId !== here.workspaceId ||
    !adoptsCliConversations(session.agent)
  ) {
    return false
  }
  const focus = captureNativeChatComposerFocusIntent()
  let openedTabId: string | null = null
  void resumeAiVaultSessionInNewChat(
    session,
    session.agent,
    here.workspaceId,
    newAgentLaunchRequestId(),
    {
      afterTabId: here.tabId,
      // Why: the focus request is the one call every launch path makes once the new tab exists.
      focusIntent: {
        request: (tabId) => {
          openedTabId = tabId
          focus.request(tabId)
        },
        cancel: focus.cancel
      },
      onSettled: (settlement) => {
        if (settlement.kind === 'structured') {
          closeReplacedChat(here)
        } else if (openedTabId) {
          // No failed tab is left; closing it hands its group back to the chat it would replace.
          useAppStore.getState().closeUnifiedTab(openedTabId)
        }
      }
    }
  )
  return true
}

function findChatTab(here: AiVaultResumeHere): Tab | undefined {
  return useAppStore
    .getState()
    .unifiedTabsByWorktree[here.workspaceId]?.find(
      (tab) => tab.id === here.tabId && tab.contentType === 'agent-session'
    )
}

function closeReplacedChat(here: AiVaultResumeHere): void {
  const state = useAppStore.getState()
  const tab = findChatTab(here)
  if (!tab) {
    return
  }
  // Why: closing a chat stops its agent, so one still replying or asking stays open beside the new one.
  const status = state.agentStatusByPaneKey[structuredAgentSessionPaneKey(tab.id, tab.entityId)]
  if (!status || status.state === 'done') {
    state.closeUnifiedTab(tab.id)
  }
}
