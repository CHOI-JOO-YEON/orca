import type { Ref } from 'react'
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native'

/** The page's scroller, with the transcript never in the browser's scroll anchoring: only the page
 *  moves the scroll (its end pin, its corrections), the same on every browser (WebKit has none), so
 *  no move of the browser's is taken for the reader's. */
export function MobileNativeChatPageScroll({
  ref,
  children,
  contentContainerStyle,
  ...props
}: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  return (
    <ScrollView ref={ref} {...props} contentContainerStyle={pageScroll.fill}>
      <View style={[contentContainerStyle, pageScroll.outOfAnchoring]}>{children}</View>
    </ScrollView>
  )
}

// RN Web passes it through to CSS; ViewStyle doesn't name it.
const outOfAnchoring: ViewStyle & { overflowAnchor: 'none' } = { overflowAnchor: 'none' }

const pageScroll = StyleSheet.create({
  fill: { flexGrow: 1 },
  outOfAnchoring
})
