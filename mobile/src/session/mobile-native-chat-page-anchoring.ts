import { scrollWritesStopMomentum } from './mobile-native-chat-page-motion'

type Styled = {
  style?: { overflowAnchor: string }
  scrollTop: number
  getBoundingClientRect: () => unknown
}

/** Who keeps a parked reader's place where the browser has scroll anchoring (not WebKit): the
 *  browser, which sees every change inside the rows on screen, except while the page owns the
 *  scroll: following (its end pin) or a place-hold's own correction. Two owners would each put the
 *  same move back. */
export class MobileNativeChatPageAnchoring {
  private holds = 0
  /** The scroll moved since the browser last chose its anchor from the rows drawn now. */
  private moved = false
  private readonly none = scrollWritesStopMomentum()

  constructor(
    private readonly scroller: () => Styled | null | undefined,
    private readonly following: () => boolean
  ) {}

  /** The page takes the scroll for one correction, or gives it back. */
  hold(on: boolean): void {
    this.holds = Math.max(0, this.holds + (on ? 1 : -1))
    this.sync()
  }

  sync(): void {
    const s = this.scroller()
    const next = this.holds === 0 && !this.following() ? 'auto' : 'none'
    if (this.none || !s?.style || s.style.overflowAnchor === next) {
      return
    }
    // Laid out under the old owner first, and the new one in force before anything changes.
    s.getBoundingClientRect()
    s.style.overflowAnchor = next
    s.getBoundingClientRect()
    if (next === 'auto') {
      // Not one kept from before the page's turn, whose move the browser would then put back too.
      this.rechoose(s)
    }
  }

  scrolled(): void {
    this.moved = true
  }

  /** At rest after a scroll: the browser chooses its anchor only when the scroll moves, and a scroll
   *  that landed on a spacer (never an anchor) left it none, though rows are drawn there now. */
  rested(): void {
    const s = this.scroller()
    if (this.moved && !this.none && s?.style?.overflowAnchor === 'auto') {
      this.moved = false
      this.rechoose(s)
    }
  }

  /** A scroll makes the browser choose its anchor afresh. */
  private rechoose(s: Styled): void {
    const top = s.scrollTop
    s.scrollTop = top > 0 ? top - 1 : top + 1
    s.scrollTop = top
  }
}
