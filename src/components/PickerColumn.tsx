import { useEffect, useRef } from 'react'
import { View, Text, ScrollView } from 'react-native'
import * as Haptics from 'expo-haptics'
import { C } from '../constants'
import { PICKER_ITEM_HEIGHT } from '../constants'

export function PickerColumn({ value, max, onChange, disabled }: { value: number; max: number; onChange: (v: number) => void; disabled: boolean }) {
  const scrollRef = useRef<ScrollView>(null)
  const numbers = Array.from({ length: max }, (_, i) => i)
  const isUserScrolling = useRef(false)

  useEffect(() => {
    if (!isUserScrolling.current) {
      scrollRef.current?.scrollTo({ y: value * PICKER_ITEM_HEIGHT, animated: false })
    }
  }, [])

  function handleScrollBegin() {
    isUserScrolling.current = true
  }

  function handleScrollEnd(e: any) {
    const y = e.nativeEvent.contentOffset.y
    const idx = Math.round(y / PICKER_ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(max - 1, idx))
    if (clamped !== value) {
      Haptics.selectionAsync()
      onChange(clamped)
    }
    isUserScrolling.current = false
  }

  return (
    <View style={{ height: PICKER_ITEM_HEIGHT * 3, width: 60, overflow: 'hidden' }}>
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={false}
        snapToInterval={PICKER_ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEnabled={!disabled}
        contentContainerStyle={{ paddingVertical: PICKER_ITEM_HEIGHT }}
        onScrollBeginDrag={handleScrollBegin}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={(e) => {
          if (e.nativeEvent.velocity && Math.abs(e.nativeEvent.velocity.y) < 0.1) {
            handleScrollEnd(e)
          }
        }}
      >
        {numbers.map(n => (
          <View key={n} style={{ height: PICKER_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{
              fontSize: n === value ? 28 : 20,
              fontWeight: n === value ? '700' : '400',
              color: n === value ? C.t1 : C.t3,
              fontVariant: ['tabular-nums'],
            }}>
              {String(n).padStart(2, '0')}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
