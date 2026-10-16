/** No touch and no scroll of the reader's for this long: a write any sooner can stop iOS momentum. */
const REST_MS = 150
type Moved = { by: 'own' | 'layout' | 'reader' | 'none'; moved: number }

type Listened = {
  addEventListener: (type: string, listener: () => void, options: { passive: true }) => void
  removeEventListener: (type: string, listener: () => void) => void
}

/** Whether the reader is moving the page, told apart from the page's own writes. Work that can move
 *  rows above the reader (a landing, a measured row, a correction) waits until it settles. */
export class MobileNativeChatPageMotion {
  private touching = false
  private lastReaderScroll = 0
  /** Where the page last accounted for the scroll: its write, an observed scroll, a resize. */
  private seen = 0
  private seenMax = Infinity
  /** A commit changed what is drawn and its resize callback hasn't run: a move now is layout's. */
  private unreconciled = false
  private drawn = ''
  private layouts = 0
  /** Where the page's own writes put the scroller, until their scroll event arrives. */
  private own: number[] = []
  private timer: ReturnType<typeof setTimeout> | undefined
  private later: ReturnType<typeof setTimeout> | undefined
  /** Owed work doesn't run again before this, so other work gets frames between its rounds. */
  private quietUntil = 0
  /** Told each move that was the reader's, with how far it is from the end. */
  onReader: ((moved: number, fromEnd: number) => void) | null = null
  private waiters: (() => void)[] = []

  constructor(private readonly onSettled: () => void) {}

  /** Follows the reader's hand on the scroller; returns the detach. */
  attach(scroller: Listened): () => void {
    const down = () => this.touch(true)
    const up = () => this.touch(false)
    scroller.addEventListener('touchstart', down, { passive: true })
    scroller.addEventListener('touchend', up, { passive: true })
    scroller.addEventListener('touchcancel', up, { passive: true })
    return () => {
      scroller.removeEventListener('touchstart', down)
      scroller.removeEventListener('touchend', up)
      scroller.removeEventListener('touchcancel', up)
    }
  }

  touch(down: boolean): void {
    this.touching = down
    if (down) {
      this.own = []
      clearTimeout(this.timer)
      this.timer = undefined
    } else {
      this.poke()
    }
  }

  /** A commit drew `drawn`. When that changed, a move is layout's until its resize callback (or the
   *  next frame, when nothing resized); scroll events run before that frame's resize callbacks. */
  laidOut(drawn: string): void {
    if (drawn === this.drawn) {
      return
    }
    this.drawn = drawn
    this.unreconciled = true
    const token = ++this.layouts
    globalThis.requestAnimationFrame?.(() => {
      if (token === this.layouts) {
        this.unreconciled = false
      }
    })
  }

  /** The resize callback reconciled layout: what moved the scroll since the page last accounted
   *  for it is now told apart (a scroll event may not have reported it yet), or is `layout`'s. */
  reconciled(scrollTop: number, max: number, layout: boolean): Moved {
    this.unreconciled = false
    if (layout) {
      const moved = scrollTop - this.seen
      ;[this.seen, this.seenMax] = [scrollTop, max]
      return { by: 'layout', moved }
    }
    return this.account(scrollTop, max)
  }

  /** What moved the scroll to `scrollTop` since the page last accounted for it, and by how much. The
   *  page's write; layout while a commit is unreconciled or rows above the reading place moved
   *  (`placeMoved`), left for the resize callback to tell apart; else as `account`. */
  scrolled(scrollTop: number, max: number, placeMoved: () => boolean): Moved {
    const moved = scrollTop - this.seen
    const at = this.own.findIndex((target) => Math.abs(target - scrollTop) <= 1)
    if (at !== -1) {
      this.own.splice(0, at + 1)
      ;[this.seen, this.seenMax] = [scrollTop, max]
      return { by: 'own', moved }
    }
    if (Math.abs(moved) >= 0.5 && !this.touching && (this.unreconciled || placeMoved())) {
      return { by: 'layout', moved }
    }
    return this.account(scrollTop, max)
  }

  /** A clamp onto a shorter end is layout's; any other move is the reader's (a finger makes it so). */
  private account(scrollTop: number, max: number): Moved {
    const [from, fromMax, moved] = [this.seen, this.seenMax, scrollTop - this.seen]
    ;[this.seen, this.seenMax] = [scrollTop, max]
    if (Math.abs(moved) < 0.5) {
      return { by: 'none', moved }
    }
    // Pulled back onto a shorter end from where the old one allowed; iOS bouncing past an end is not.
    const clamped = Math.abs(scrollTop - max) < 0.5 && from > max + 0.5 && from <= fromMax + 0.5
    if (clamped && !this.touching) {
      return { by: 'layout', moved }
    }
    this.lastReaderScroll = Date.now()
    this.poke()
    this.onReader?.(moved, max - scrollTop)
    return { by: 'reader', moved }
  }

  wrote(target: number): void {
    this.own = [...this.own.slice(-7), target]
    this.seen = target
  }

  settled(): boolean {
    return !this.touching && Date.now() - this.lastReaderScroll >= REST_MS
  }

  /** Resolves once settled, or when the window goes away (`release`), so a wait never strands. */
  whenSettled(): Promise<void> {
    if (this.settled()) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve)
      this.poke()
    })
  }

  poke(): void {
    if (this.touching || this.timer !== undefined) {
      return
    }
    const now = Date.now()
    const wait = Math.max(0, REST_MS - (now - this.lastReaderScroll), this.quietUntil - now)
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.settled() || Date.now() < this.quietUntil) {
        this.poke()
        return
      }
      this.waiters.splice(0).forEach((resolve) => resolve())
      this.onSettled()
    }, wait)
  }

  /** Owed work waits `ms` before its next round. */
  quiet(ms: number): void {
    this.quietUntil = Date.now() + ms
  }

  /** Checks for owed work again after `ms`, when nothing else will. */
  pokeIn(ms: number): void {
    clearTimeout(this.later)
    this.later = setTimeout(() => this.poke(), ms)
  }

  release(): void {
    clearTimeout(this.later)
    clearTimeout(this.timer)
    this.timer = undefined
    this.waiters.splice(0).forEach((resolve) => resolve())
  }
}
