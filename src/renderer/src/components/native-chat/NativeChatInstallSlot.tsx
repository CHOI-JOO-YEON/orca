import { translate } from '@/i18n/i18n'
import {
  useManagedRuntimeInstall,
  type ManagedRuntimeInstallObservation
} from '@/runtime/use-managed-runtime-install'
import type { ManagedRuntimeInstallState } from '../../../../shared/managed-runtime-install'
import { NativeChatInstallStrip } from './NativeChatInstallStrip'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'

/** What a chat's input slot holds for the program its host must install first. */
export type NativeChatInstallSlotState =
  | { kind: 'none' }
  /** The first status read is out: the composer stays, its sends held until the host answers. */
  | { kind: 'reserved' }
  | {
      kind: 'install'
      observation: Extract<ManagedRuntimeInstallObservation, { kind: 'active' }>
      state: ManagedRuntimeInstallState
      /** The chat has messages: Install is a strip above the composer, not the pane's message. */
      hasHistory: boolean
    }

export type NativeChatInstallSlotInstall = Extract<NativeChatInstallSlotState, { kind: 'install' }>

const NONE: NativeChatInstallSlotState = { kind: 'none' }
const RESERVED: NativeChatInstallSlotState = { kind: 'reserved' }

/** Install shows while the chat's host has nothing to run, its install included, and the composer
 *  stays disabled beneath it; anything runnable, or a status the host could not report, leaves
 *  the composer alone. Until the host says whether it provides the program, the composer stays
 *  usable but sends nothing. */
export function useNativeChatInstallSlot(
  props: Pick<NativeChatStructuredViewProps, 'target' | 'agent' | 'isVisible'>,
  agentLabel: string,
  hasHistory: boolean
): {
  slot: NativeChatInstallSlotState
  sendBlockedReason: string | null
  unavailableHint: string | undefined
} {
  const slot = installSlotState(
    useManagedRuntimeInstall(props.target, props.agent, props.isVisible),
    hasHistory
  )
  const unavailableHint =
    slot.kind === 'install'
      ? translate(
          'components.managed-runtime.installTitle',
          'Install {{agent}} to start chatting',
          { agent: agentLabel }
        )
      : undefined
  return {
    slot,
    sendBlockedReason: unavailableHint ?? installSlotSendBlockedReason(slot, agentLabel),
    unavailableHint
  }
}

function installSlotState(
  observation: ManagedRuntimeInstallObservation,
  hasHistory: boolean
): NativeChatInstallSlotState {
  if (observation.kind === 'inactive') {
    return NONE
  }
  if (observation.kind === 'pending') {
    return RESERVED
  }
  const { snapshot } = observation
  if (snapshot.kind === 'readFailed') {
    return NONE
  }
  if (snapshot.kind === 'unknown') {
    return RESERVED
  }
  return snapshot.state.source === null
    ? { kind: 'install', observation, state: snapshot.state, hasHistory }
    : NONE
}

/** Send stays held until the host says it can run this agent. */
function installSlotSendBlockedReason(
  slot: NativeChatInstallSlotState,
  agentLabel: string
): string | null {
  return slot.kind === 'none'
    ? null
    : translate(
        'components.native-chat.install.checking',
        'Checking whether {{agent}} is ready on this host…',
        { agent: agentLabel }
      )
}

/** The strip above the composer for a chat that already has messages. */
export function NativeChatInstallSlot(props: {
  slot: NativeChatInstallSlotState
  agentLabel: string
}): React.JSX.Element | null {
  const { slot } = props
  if (slot.kind !== 'install' || !slot.hasHistory) {
    return null
  }
  return (
    <div className="min-h-0 shrink overflow-hidden bg-chat-canvas">
      <div className="mx-auto w-full max-w-(--chat-content-max-width) px-3 pt-2 pb-1 sm:px-4">
        <NativeChatInstallStrip slot={slot} agentLabel={props.agentLabel} />
      </div>
    </div>
  )
}
