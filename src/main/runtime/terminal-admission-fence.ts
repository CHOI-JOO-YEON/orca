/**
 * The window between an update's last terminal census and the stop that follows it (R32): while
 * closed, this server starts no new terminal, so the census stays true until the stop.
 * Process-wide on purpose: the stop it guards ends the whole server.
 */
let closedUntilMs = 0

export class TerminalAdmissionClosedError extends Error {
  constructor() {
    super('This server is restarting for an update. Try again in a moment.')
    this.name = 'TerminalAdmissionClosedError'
  }
}

/** Closes admission for `durationMs` (0 reopens) and returns when it reopens on its own. */
export function closeTerminalAdmission(durationMs: number, now = Date.now()): number {
  closedUntilMs = durationMs > 0 ? now + durationMs : 0
  return closedUntilMs
}

export function isTerminalAdmissionClosed(now = Date.now()): boolean {
  return closedUntilMs > now
}
