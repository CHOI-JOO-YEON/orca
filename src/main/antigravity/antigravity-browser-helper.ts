// The Antigravity server opens its Google sign-in page through BROWSER. Orca points that at a
// one-line program run by its own executable in Node mode, which prints the link on error output
// instead: the link is captured either way, and no browser opens on the host.

import { runProcess } from '@orca/process-host'

/** The line the server prints before its sign-in link. */
export const ANTIGRAVITY_SIGN_IN_PROMPT = 'Open the following link to authenticate the ACP server:'
export const ANTIGRAVITY_BROWSER_MARKER = '__ORCA_ANTIGRAVITY_AUTH_URL__'

// EPIPE still exits 0, or Python falls back to a real browser once nothing reads the output.
const HELPER_SOURCE =
  `process.stderr.on("error",()=>process.exit(0)).write(` +
  `"${ANTIGRAVITY_BROWSER_MARKER}"+JSON.stringify(process.argv[1])+"\\n",()=>process.exit(0))`
const PREFLIGHT_URL = 'https://example.invalid/orca-antigravity-browser-preflight'

// Python splits BROWSER with shlex, whose POSIX quoting it uses on every platform.
const quote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`

/** The BROWSER command, its argv (null when the executable's path can't be one), and what the
 *  server's environment adds for it. POSIX sets Node mode in the command itself, because the
 *  provider supervisor strips ELECTRON_RUN_AS_NODE from every child; Windows has no such prefix. */
function antigravityBrowserHelper(platform: NodeJS.Platform, execPath: string) {
  const windows = platform === 'win32'
  const executable = windows ? execPath.replaceAll('\\', '/') : execPath
  const argv = [
    ...(windows ? [] : ['/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1']),
    executable,
    '-e',
    HELPER_SOURCE,
    '--',
    '%s'
  ]
  const command = argv.map(quote).join(' ')
  // Python splits BROWSER on the path separator before it reads quotes.
  const usable = !command.includes(windows ? ';' : ':') && !/[\r\n\0]|%s/.test(executable)
  const env: Record<string, string> = windows ? { ELECTRON_RUN_AS_NODE: '1' } : {}
  return { command, argv: usable ? argv : null, env }
}

export const ANTIGRAVITY_BROWSER = antigravityBrowserHelper(process.platform, process.execPath)

/** Runs the helper once as the server would; checked before every server start, since a broken
 *  helper would let the server open a browser on this host. */
export async function antigravityBrowserHelperWorks(
  helper = ANTIGRAVITY_BROWSER
): Promise<boolean> {
  const [program, ...args] = (helper.argv ?? []).map((arg) => (arg === '%s' ? PREFLIGHT_URL : arg))
  if (!program) {
    return false
  }
  const result = await runProcess({
    program,
    args,
    env: { ...process.env, ...helper.env },
    timeoutMs: 5_000,
    maxOutputBytes: 4_096
  }).catch(() => null)
  return (
    result?.code === 0 &&
    result.stdout === '' &&
    result.stderr === `${ANTIGRAVITY_BROWSER_MARKER}${JSON.stringify(PREFLIGHT_URL)}\n`
  )
}

/** The link text on a sign-in line, the server's printed prompt or the helper's; null for any
 *  other line, and '' for one whose link can't be read. */
export function antigravitySignInLinkText(line: string): string | null {
  const text = line.trim()
  if (text.startsWith(ANTIGRAVITY_SIGN_IN_PROMPT)) {
    return text.slice(ANTIGRAVITY_SIGN_IN_PROMPT.length).trim()
  }
  if (!text.startsWith(ANTIGRAVITY_BROWSER_MARKER)) {
    return null
  }
  try {
    const link: unknown = JSON.parse(text.slice(ANTIGRAVITY_BROWSER_MARKER.length))
    return typeof link === 'string' ? link : ''
  } catch {
    return ''
  }
}
