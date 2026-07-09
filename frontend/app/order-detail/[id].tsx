import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts, statusColors } from '@/src/lib/theme';

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

function pickupCode(orderId: string): string {
  const n = parseInt(orderId.replace(/-/g, '').slice(0, 8), 16);
  return String((n % 900000) + 100000).split('').join(' ');
}

function orderRef(checkoutId: string, createdAt: string): string {
  const d = new Date(createdAt);
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const suffix = checkoutId.replace(/-/g, '').slice(0, 4).toUpperCase();
  return `AA-${date}-${suffix}`;
}

type OrderItem = {
  id: string;
  pickle_name: string;
  variant_label: string | null;
  quantity: number;
  line_total_inr: number;
};

type StoreOrder = {
  id: string;
  status: string;
  total_inr: string;
  ready_date: string | null;
  created_at: string;
  store_name: string | null;
  order_items: OrderItem[];
};

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile || !id) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('id, status, total_inr, ready_date, created_at, store_name, order_items(id, pickle_name, variant_label, quantity, line_total_inr)')
      .eq('checkout_id', id)
      .order('created_at', { ascending: true });
    setOrders(data || []);
    setLoading(false);
  }, [profile, id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const multiStore = orders.length > 1;
  const grandTotal = orders.reduce((s, o) => s + Number(o.total_inr), 0);
  const firstOrder = orders[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          {firstOrder ? (
            <>
              <Text style={styles.orderRef}>
                Order #{orderRef(id, firstOrder.created_at)}
              </Text>
              <Text style={styles.orderDate}>
                {new Date(firstOrder.created_at).toLocaleString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </>
          ) : (
            <Text style={styles.orderRef}>Order Details</Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Per-store sections */}
          <View style={styles.card}>
            {orders.map((order, idx) => {
              const s = statusColors[order.status] || { bg: colors.surfaceTertiary, fg: colors.onSurface, label: order.status };
              const showPickup = order.status === 'ready_for_takeaway' || order.status === 'completed';
              const isLast = idx === orders.length - 1;

              return (
                <View key={order.id} style={[styles.storeSection, !isLast && styles.sectionDivider]}>
                  {/* Store name + status */}
                  <View style={styles.rowBetween}>
                    <Text style={styles.storeName} numberOfLines={1}>{order.store_name ?? '—'}</Text>
                    <View style={[styles.badge, { backgroundColor: s.bg }]}>
                      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
                    </View>
                  </View>

                  {/* Item rows */}
                  {(order.order_items || []).map((oi) => (
                    <View key={oi.id} style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {oi.quantity}× {oi.pickle_name}
                        {oi.variant_label ? ` (${oi.variant_label})` : ''}
                      </Text>
                      <Text style={styles.itemPrice}>₹{fmt(Number(oi.line_total_inr))}</Text>
                    </View>
                  ))}

                  {/* Ready date */}
                  {order.ready_date && (
                    <Text style={styles.readyDate}>
                      Ready on {new Date(order.ready_date).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </Text>
                  )}

                  {/* Pickup code — only when ready */}
                  {showPickup && (
                    <View style={styles.pickupBox}>
                      <Text style={styles.pickupLabel}>Pickup code</Text>
                      <Text style={styles.pickupCode}>{pickupCode(order.id)}</Text>
                    </View>
                  )}

                  {/* Store subtotal — only meaningful when multi-store */}
                  {multiStore && (
                    <View style={styles.subtotalRow}>
                      <Text style={styles.subtotalLabel}>Store subtotal</Text>
                      <Text style={styles.subtotalVal}>₹{fmt(Number(order.total_inr))}</Text>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Grand total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalVal}>₹{fmt(grandTotal)}</Text>
            </View>
          </View>

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
    flexShrink: 0,
  },
  orderRef: { fontFamily: fonts.display, fontSize: 15, color: colors.onSurface },
  orderDate: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },

  scroll: { padding: spacing.lg },

  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  storeSection: { padding: spacing.lg, gap: spacing.sm },
  sectionDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storeName: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface, flex: 1, marginRight: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, flexShrink: 0 },
  badgeText: { fontFamily: fonts.textBold, fontSize: 10, letterSpacing: 0.5 },

  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  itemName: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary, flex: 1 },
  itemPrice: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface, flexShrink: 0 },

  readyDate: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.success },

  pickupBox: {
    backgroundColor: colors.onSurface,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 4,
    marginTop: spacing.xs,
  },
  pickupLabel: { fontFamily: fonts.text, fontSize: 11, color: colors.borderStrong },
  pickupCode: { fontFamily: fonts.display, fontSize: 26, color: colors.onBrandPrimary, letterSpacing: 6 },

  subtotalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  subtotalLabel: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.muted },
  subtotalVal: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  totalLabel: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  totalVal: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },

  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  actionBtn: {
    flex: 1, paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
  },
  actionText: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
});
