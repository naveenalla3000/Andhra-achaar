import { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const { width: W, height: H } = Dimensions.get('window');

const CONFETTI_COLORS = [
  '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF922B',
  '#CC5DE8', '#F783AC', '#20C997', '#FFA94D', '#A33B20',
];

type Piece = {
  id: number;
  color: string;
  x: number;
  width: number;
  height: number;
  delay: number;
  duration: number;
  driftX: number;
  rotation: number;
  borderRadius: number;
};

function makePieces(): Piece[] {
  return Array.from({ length: 60 }, (_, i) => {
    const w = 6 + Math.random() * 8;
    const tall = Math.random() > 0.4;
    return {
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      x: Math.random() * W,
      width: w,
      height: tall ? w * 2.2 : w,
      delay: Math.random() * 700,
      duration: 1500 + Math.random() * 1200,
      driftX: (Math.random() - 0.5) * 140,
      rotation: (Math.random() - 0.5) * 800,
      borderRadius: tall ? 2 : w / 2,
    };
  });
}

function ConfettiPiece({ p }: { p: Piece }) {
  const y = useSharedValue(-40);
  const x = useSharedValue(0);
  const rot = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    op.value = withDelay(p.delay, withTiming(1, { duration: 60 }));
    y.value = withDelay(p.delay, withTiming(H + 60, { duration: p.duration, easing: Easing.in(Easing.quad) }));
    x.value = withDelay(p.delay, withTiming(p.driftX, { duration: p.duration }));
    rot.value = withDelay(p.delay, withTiming(p.rotation, { duration: p.duration }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [
      { translateY: y.value },
      { translateX: x.value },
      { rotate: `${rot.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: p.x,
          width: p.width,
          height: p.height,
          backgroundColor: p.color,
          borderRadius: p.borderRadius,
        },
        style,
      ]}
    />
  );
}

export default function OrderSuccess() {
  const router = useRouter();
  const pieces = useMemo(makePieces, []);

  const checkScale = useSharedValue(0);
  const contentOp = useSharedValue(0);
  const contentY = useSharedValue(24);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    checkScale.value = withDelay(200, withSpring(1, { damping: 11, stiffness: 130 }));
    contentOp.value = withDelay(500, withTiming(1, { duration: 450 }));
    contentY.value = withDelay(500, withTiming(0, { duration: 450, easing: Easing.out(Easing.quad) }));
  }, []);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOp.value,
    transform: [{ translateY: contentY.value }],
  }));

  return (
    <SafeAreaView style={styles.safe}>
      {/* Confetti layer */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {pieces.map(p => <ConfettiPiece key={p.id} p={p} />)}
      </View>

      {/* Main content */}
      <View style={styles.center}>
        <Animated.View style={[styles.checkCircle, checkStyle]}>
          <Feather name="check" size={48} color="#fff" />
        </Animated.View>

        <Animated.View style={[styles.textBlock, contentStyle]}>
          <Text style={styles.title}>Order Placed!</Text>
          <Text style={styles.sub}>
            Your order is confirmed.{'\n'}Pay at the store when you pick up.
          </Text>

          <Pressable
            style={styles.btn}
            onPress={() => router.replace('/(customer)/account')}
          >
            <Text style={styles.btnText}>View My Orders</Text>
          </Pressable>

          <Pressable
            style={styles.ghostBtn}
            onPress={() => router.replace('/(customer)/home')}
          >
            <Text style={styles.ghostBtnText}>Back to Home</Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  piece: { position: 'absolute', top: 0 },

  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 14,
  },

  textBlock: { alignItems: 'center', gap: spacing.md, width: '100%' },

  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.onSurface,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fonts.text,
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 24,
  },

  btn: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    width: '100%',
    alignItems: 'center',
  },
  btnText: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onBrandPrimary },

  ghostBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  ghostBtnText: {
    fontFamily: fonts.textMedium,
    fontSize: 13,
    color: colors.muted,
  },
});
