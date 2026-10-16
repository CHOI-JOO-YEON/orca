import type { Ref } from 'react'
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native'

/** The page's scroller: the transcript in one wrapper, then a 1 px end marker. The transcript is
 *  never in the browser's scroll anchoring: the page keeps the reader's place itself, the same on
 *  every browser (WebKit has no anchoring), so no browser move overlaps a correction. While the
 *  reader follows, the marker is the anchor, so trimming a row above can't scroll the view off the
 *  end; parked, nothing is. */
export function MobileNativeChatPageScroll({
  ref,
  children,
  contentContainerStyle,
  endAnchored,
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollView>; endAnchored: boolean }) {
  return (
    <ScrollView ref={ref} {...props} contentContainerStyle={pageScroll.fill}>
      <View style={[contentContainerStyle, pageScroll.outOfAnchoring]}>{children}</View>
      <View style={[pageScroll.endMarker, !endAnchored && pageScroll.outOfAnchoring]} />
    </ScrollView>
  )
}

// RN Web passes it through to CSS; ViewStyle doesn't name it.
const outOfAnchoring: ViewStyle & { overflowAnchor: 'none' } = { overflowAnchor: 'none' }

const pageScroll = StyleSheet.create({
  fill: { flexGrow: 1 },
  outOfAnchoring,
  endMarker: { height: 1 }
})
