import { useCallback, useState, useSyncExternalStore } from 'react'
import type { AiVaultScanProgress } from '../../../../shared/ai-vault-scan-progress'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostScope } from '../../../../shared/execution-host'

const MAX_PROGRESS_ENTRIES = 8
const progressByKey = new Map<string, AiVaultScanProgress>()
const requestedKeys = new Set<string>()
// A push supersedes any fetch still in flight for that key, however many other keys pushed meanwhile.
const pendingLoads = new Set<string>()
const listeners = new Set<() => void>()
let subscribed = false

function rememberKey(keys: Set<string>, scanKey: string): void {
  keys.delete(scanKey)
  keys.add(scanKey)
  while (keys.size > MAX_PROGRESS_ENTRIES) {
    const oldest = keys.values().next().value
    if (oldest === undefined) {
      break
    }
    keys.delete(oldest)
  }
}

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function setProgress(scanKey: string, progress: AiVaultScanProgress | null): void {
  progressByKey.delete(scanKey)
  if (progress) {
    progressByKey.set(scanKey, progress)
  }
  while (progressByKey.size > MAX_PROGRESS_ENTRIES) {
    const oldest = progressByKey.keys().next().value
    if (oldest === undefined) {
      break
    }
    progressByKey.delete(oldest)
  }
  emit()
}

function ensureSubscribed(): void {
  if (subscribed) {
    return
  }
  subscribed = true
  window.api.aiVault.onScanProgress?.(({ scanKey, progress }) => {
    pendingLoads.delete(scanKey)
    setProgress(scanKey, progress)
  })
}

function loadKey(scanKey: string): void {
  if (requestedKeys.has(scanKey)) {
    return
  }
  rememberKey(requestedKeys, scanKey)
  const request = window.api.aiVault.getScanProgress?.(scanKey)
  if (!request) {
    return
  }
  pendingLoads.add(scanKey)
  void request
    .then((progress) => {
      if (pendingLoads.delete(scanKey)) {
        setProgress(scanKey, progress)
      }
    })
    .catch(() => pendingLoads.delete(scanKey))
}

function useKeyProgress(
  subscribe: (listener: () => void) => () => void,
  local: boolean,
  scanKey: string
): AiVaultScanProgress | null {
  const snapshot = useCallback(
    () => (local ? (progressByKey.get(scanKey) ?? null) : null),
    [local, scanKey]
  )
  return useSyncExternalStore(subscribe, snapshot)
}

/** Follows the request key; until that key has progress, keeps following the key shown before. */
export function useAiVaultScanProgress(
  executionHostScope: ExecutionHostScope,
  scanKey: string
): AiVaultScanProgress | null {
  const local = executionHostScope === LOCAL_EXECUTION_HOST_ID
  const subscribe = useCallback(
    (listener: () => void) => {
      if (local) {
        ensureSubscribed()
        loadKey(scanKey)
      }
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    [local, scanKey]
  )
  // Why: the key follows the active worktree, so dropping to nothing between keys would
  // make the strip vanish and the list jump on every switch.
  const [shownKey, setShownKey] = useState(scanKey)
  const own = useKeyProgress(subscribe, local, scanKey)
  const shown = useKeyProgress(subscribe, local, shownKey)
  if (own && shownKey !== scanKey) {
    setShownKey(scanKey)
  }
  return own ?? shown
}

export function resetAiVaultScanProgressStoreForTests(): void {
  progressByKey.clear()
  requestedKeys.clear()
  pendingLoads.clear()
  subscribed = false
  listeners.clear()
}
