import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '@/src/lib/theme';

const ITEM_H = 54;
const PAD = 2;          // items above/below selected
const VISIBLE = 5;      // must be odd

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

type WheelProps = { items: string[]; initial: string; onSelect: (v: string) => void };

function Wheel({ items, initial, onSelect }: WheelProps) {
  const scrollRef = useRef<any>(null);

  // scrollY lives on the native thread — drives all item animations without JS involvement
  const scrollY = useRef(new Animated.Value(0)).current;

  // Fades the wheel in after the initial scrollTo, hiding the first-frame position
  const readyOpacity = useRef(new Animated.Value(0)).current;

  // One interpolation per item — computed once, reused every frame on native thread
  const interpolations = useMemo(() =>
    items.map((_, i) => {
      const c = i * ITEM_H;
      const range = [c - 2 * ITEM_H, c - ITEM_H, c, c + ITEM_H, c + 2 * ITEM_H];
      return {
        scale: scrollY.interpolate({
          inputRange: range,
          outputRange: [0.5, 0.72, 1.0, 0.72, 0.5],
          extrapolate: 'clamp',
        }),
        opacity: scrollY.interpolate({
          inputRange: range,
          outputRange: [0.08, 0.35, 1.0, 0.35, 0.08],
          extrapolate: 'clamp',
        }),
      };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  // Memoised so Animated.ScrollView doesn't get a new onScroll prop every render
  const onScroll = useMemo(
    () => Animated.event(
      [{ nativeEvent: { contentOffset: { y: scrollY } } }],
      { useNativeDriver: true },
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const idx = Math.max(0, items.indexOf(initial));
    // Wait one tick for the ScrollView to mount, then jump without animation
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated: false });
      Animated.timing(readyOpacity, {
        toValue: 1, duration: 120, useNativeDriver: true,
      }).start();
    }, 60);
    return () => clearTimeout(t);
    // Only run on mount — `initial` is the value at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.max(
        0,
        Math.min(
          Math.round(e.nativeEvent.contentOffset.y / ITEM_H),
          items.length - 1,
        ),
      );
      onSelect(items[i]);
    },
    [items, onSelect],
  );

  return (
    <Animated.View style={[styles.wheel, { opacity: readyOpacity }]}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumScrollEnd}
        contentContainerStyle={{ paddingVertical: ITEM_H * PAD }}
        scrollEventThrottle={16}
        nestedScrollEnabled
      >
        {items.map((item, i) => (
          <View key={item} style={styles.slot}>
            <Animated.Text
              style={[
                styles.item,
                {
                  transform: [{ scale: interpolations[i].scale }],
                  opacity: interpolations[i].opacity,
                },
              ]}
            >
              {item}
            </Animated.Text>
          </View>
        ))}
      </Animated.ScrollView>

      {/* Selection band — two hairlines around the centre slot */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ height: ITEM_H * PAD }} />
        <View style={styles.selectionBand} />
      </View>

      {/* Gradient fade — top */}
      <LinearGradient
        colors={[colors.surface, 'rgba(253,251,247,0)']}
        style={[styles.gradient, { top: 0 }]}
        pointerEvents="none"
      />
      {/* Gradient fade — bottom */}
      <LinearGradient
        colors={['rgba(253,251,247,0)', colors.surface]}
        style={[styles.gradient, { bottom: 0 }]}
        pointerEvents="none"
      />
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type Props = { value: string; onChange: (v: string) => void };

export default function TimePickerWheel({ value, onChange }: Props) {
  const [initH, initM] = value.split(':');

  // Refs avoid stale-closure issues between the two wheels
  const hRef = useRef(initH || '09');
  const mRef = useRef(initM || '00');

  const onHour = useCallback(
    (h: string) => { hRef.current = h; onChange(`${h}:${mRef.current}`); },
    [onChange],
  );
  const onMinute = useCallback(
    (m: string) => { mRef.current = m; onChange(`${hRef.current}:${m}`); },
    [onChange],
  );

  return (
    <View style={styles.container}>
      <Wheel items={HOURS} initial={initH || '09'} onSelect={onHour} />
      <Text style={styles.colon}>:</Text>
      <Wheel items={MINUTES} initial={initM || '00'} onSelect={onMinute} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ITEM_H * VISIBLE,
    paddingHorizontal: 24,
    gap: 8,
  },
  wheel: {
    flex: 1,
    height: ITEM_H * VISIBLE,
    overflow: 'hidden',
  },
  slot: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    fontFamily: fonts.textBold,
    fontSize: 30,
    color: colors.onSurface,
  },
  selectionBand: {
    height: ITEM_H,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.brandPrimary + '0A',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_H * PAD,
    zIndex: 1,
  },
  colon: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.onSurface,
    marginBottom: 4,
    width: 20,
    textAlign: 'center',
  },
});
