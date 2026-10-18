// @vitest-environment happy-dom
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { AiVaultScanProgress } from '../../../../shared/ai-vault-scan-progress'
import { aiVaultLocalScanKey } from '../../../../shared/ai-vault-local-scan-key'
import { AiVaultScanProgressStrip } from './AiVaultScanProgressStrip'
import { resetAiVaultSessionResultCacheForTest } from './ai-vault-session-result-cache'
import {
  resetAiVaultScanProgressStoreForTests,
  useAiVaultScanProgress
} from './ai-vault-scan-progress-store'

afterEach(() => {
  cleanup()
  resetAiVaultScanProgressStoreForTests()
  resetAiVaultSessionResultCacheForTest()
  vi.unstubAllGlobals()
})

const FINISHED: AiVaultScanProgress = {
  scanId: 'scan-a',
  stage: 'finished',
  agents: [
    { agent: 'claude', files: 24_968, databases: 0, walking: false },
    { agent: 'codex', files: 77_483, databases: 0, walking: false },
    { agent: 'opencode', files: 0, databases: 1, walking: false }
  ],
  read: { done: 2_000, total: 2_000 },
  startedAt: 0,
  settledAt: 90_000
}

it('says the finished total in the strip and opens to one row per agent', async () => {
  render(<AiVaultScanProgressStrip progress={FINISHED} />)
  expect(screen.getByText('102,452 files').parentElement?.textContent).toBe('Scanned 102,452 files')
  expect(screen.queryByText('Codex')).toBeNull()

  await userEvent.setup().click(screen.getByRole('button'))
  expect(screen.getByText('77,483 files')).toBeTruthy()
  expect(screen.getByText('1 database')).toBeTruthy()
})

it('keeps a narrower cached panel off the broader key while a late matching panel loads it', async () => {
  const lowerDepth = { scopePaths: ['/project'], includeAntigravityIdeSessions: true, limit: 100 }
  const broader = aiVaultLocalScanKey({ ...lowerDepth, limit: 1000 })
  const narrower = aiVaultLocalScanKey(lowerDepth)
  expect(broader).not.toBe(narrower)
  const cachedProgress = FINISHED
  let push: (update: { scanKey: string; progress: AiVaultScanProgress | null }) => void = () =>
    undefined
  vi.stubGlobal('api', {
    aiVault: {
      getScanProgress: (scanKey: string) =>
        Promise.resolve(scanKey === broader ? cachedProgress : null),
      onScanProgress: (callback: typeof push) => {
        push = callback
        return () => undefined
      }
    }
  })
  const local = renderHook(() => useAiVaultScanProgress('local', broader))
  const narrowerPanel = renderHook(() => useAiVaultScanProgress('local', narrower))
  const remote = renderHook(() =>
    useAiVaultScanProgress('runtime:server-1', broader)
  )
  await waitFor(() => expect(local.result.current).toBe(cachedProgress))
  act(() => push({ scanKey: broader, progress: cachedProgress }))

  expect(local.result.current).toBe(cachedProgress)
  expect(narrowerPanel.result.current).toBeNull()
  act(() =>
    push({ scanKey: broader, progress: { ...cachedProgress, scanId: 'later', stage: 'finding' } })
  )
  expect(narrowerPanel.result.current).toBeNull()
  // A remote host has no progress stream yet; its panel keeps today's spinner and error line.
  expect(remote.result.current).toBeNull()
})

it('keeps the strip on screen through rescans and worktree switches', () => {
  let push: (update: { scanKey: string; progress: AiVaultScanProgress | null }) => void = () =>
    undefined
  vi.stubGlobal('api', {
    aiVault: {
      getScanProgress: () => new Promise<null>(() => undefined),
      onScanProgress: (callback: typeof push) => {
        push = callback
        return () => undefined
      }
    }
  })
  function Panel({ scanKey }: { scanKey: string }) {
    const progress = useAiVaultScanProgress('local', scanKey)
    return progress ? <AiVaultScanProgressStrip progress={progress} /> : null
  }
  const panel = render(<Panel scanKey="worktree-a" />)
  const view = within(panel.container)
  act(() => push({ scanKey: 'worktree-a', progress: FINISHED }))
  expect(view.getByText('Scanned', { exact: false })).toBeTruthy()

  const next = { ...FINISHED, scanId: 'scan-a-next' }
  act(() => push({ scanKey: 'worktree-a', progress: { ...next, stage: 'reading', settledAt: null } }))
  expect(view.getByText('Reading', { exact: false })).toBeTruthy()
  // Finished before the list it produced is applied: still one row, now settled.
  act(() => push({ scanKey: 'worktree-a', progress: next }))
  expect(view.getByText('Scanned', { exact: false })).toBeTruthy()

  // A new key has nothing yet: the row keeps following the old key until it does.
  panel.rerender(<Panel scanKey="worktree-b" />)
  expect(view.getByText('Scanned', { exact: false })).toBeTruthy()
  act(() =>
    push({
      scanKey: 'worktree-b',
      progress: { ...FINISHED, scanId: 'scan-b', stage: 'finding', settledAt: null }
    })
  )
  expect(view.getByText('Scanning', { exact: false })).toBeTruthy()
})
