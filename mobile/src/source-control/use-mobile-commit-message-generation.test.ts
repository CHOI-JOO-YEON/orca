import { createElement, useRef, useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileGenerateCommitMessageResult } from './mobile-commit-message-ai'

vi.mock('../platform/haptics', () => ({ triggerError: vi.fn(), triggerSuccess: vi.fn() }))
const reply = vi.hoisted(() => {
  const held: { resolve: ((result: MobileGenerateCommitMessageResult) => void) | null } = {
    resolve: null
  }
  return held
})
vi.mock('./mobile-commit-message-ai', () => ({
  requestMobileCommitMessage: () =>
    new Promise<MobileGenerateCommitMessageResult>((resolve) => {
      reply.resolve = resolve
    }),
  cancelMobileCommitMessage: async () => {}
}))

import { useMobileCommitMessageGeneration } from './use-mobile-commit-message-generation'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mocked request module never reaches the client.
const client = {} as RpcClient
const view: {
  message: string
  type: ((next: string) => void) | null
  generate: (() => Promise<void>) | null
} = { message: '', type: null, generate: null }

function Harness(): null {
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const mountedRef = useRef(true)
  const busyActionRef = useRef<string | null>(null)
  const { generateCommitMessage } = useMobileCommitMessageGeneration({
    client,
    worktreeId: 'wt-1',
    generatingMessage: generating,
    mountedRef,
    busyActionRef,
    setGeneratingMessage: setGenerating,
    setCommitMessage: setMessage,
    setActionError: () => {}
  })
  view.message = message
  view.type = setMessage
  view.generate = generateCommitMessage
  return null
}

let renderer: ReactTestRenderer | null = null

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
  reply.resolve = null
})

async function generateThen(typed: string | null): Promise<void> {
  act(() => {
    renderer = create(createElement(Harness))
  })
  let pending: Promise<void> | undefined
  act(() => {
    pending = view.generate?.()
  })
  if (typed !== null) {
    act(() => view.type?.(typed))
  }
  await act(async () => {
    reply.resolve?.({ success: true, message: 'feat: generated' })
    await pending
  })
}

describe('useMobileCommitMessageGeneration', () => {
  it('keeps what the user typed while the agent ran, as desktop does', async () => {
    await generateThen('fix: my own words')
    expect(view.message).toBe('fix: my own words')
  })

  it('fills an empty box with the generated message', async () => {
    await generateThen(null)
    expect(view.message).toBe('feat: generated')
  })
})
