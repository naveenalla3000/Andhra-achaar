import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { Image } from 'expo-image';
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

type OrderItem = {
  id: string;
  pickle_name: string;
  variant_label: string | null;
  quantity: number;
  line_total_inr: number;
};

type StoreOrder = {
  id: string;
  order_ref: string;
  status: string;
  total_inr: string;
  ready_date: string | null;
  created_at: string;
  store_name: string | null;
  store_image_url: string | null;
  store_address: string | null;
  store_latitude: number | null;
  store_longitude: number | null;
  store_contact_number: string | null;
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
      .select(`
        id, order_ref, status, total_inr, ready_date, created_at,
        store_name, store_image_url, store_address,
        store_latitude, store_longitude, store_contact_number,
        order_items(id, pickle_name, variant_label, quantity, line_total_inr)
      `)
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
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          {firstOrder ? (
            <>
              <Text style={styles.orderRef}>Order #{firstOrder.order_ref}</Text>
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
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            {orders.map((order, idx) => {
              const s = statusColors[order.status] || { bg: colors.surfaceTertiary, fg: colors.onSurface, label: order.status };
              const showPickup = order.status === 'ready_for_takeaway' || order.status === 'completed';
              const isLast = idx === orders.length - 1;
              const hasLocation = order.store_latitude != null && order.store_longitude != null;
              const hasCall = !!order.store_contact_number;
              const hasActions = hasCall || hasLocation;

              return (
                <View key={order.id} style={[styles.storeSection, !isLast && styles.sectionDivider]}>

                  {/* ── Store info ── */}
                  <View style={styles.storeInfo}>
                    {/* Image / placeholder */}
                    {order.store_image_url ? (
                      <Image
                        source={order.store_image_url}
                        style={styles.storeImg}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.storeImgPlaceholder}>
                        <Feather name="home" size={26} color={colors.brandPrimary} />
                      </View>
                    )}

                    {/* Name + badge + address */}
                    <View style={styles.storeMeta}>
                      <View style={styles.storeNameRow}>
                        <Text style={styles.storeName} numberOfLines={1}>
                          {order.store_name ?? '—'}
                        </Text>
                        <View style={[styles.badge, { backgroundColor: s.bg }]}>
                          <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
                        </View>
                      </View>
                      {order.store_address ? (
                        <View style={styles.addrRow}>
                          <Feather name="map-pin" size={11} color={colors.muted} style={{ marginTop: 1 }} />
                          <Text style={styles.storeAddr} numberOfLines={2}>
                            {order.store_address}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* ── Action bar ── */}
                  {hasActions ? (
                    <View style={styles.actionBar}>
                      {hasCall ? (
                        <Pressable
                          style={({ pressed }) => [styles.actionBarBtn, pressed && { opacity: 0.6 }]}
                          onPress={() => Linking.openURL(`tel:${order.store_contact_number}`)}
                        >
                          <Feather name="phone" size={14} color={colors.brandPrimary} />
                          <Text style={styles.actionBarText}>Call Store</Text>
                        </Pressable>
                      ) : null}
                      {hasCall && hasLocation ? (
                        <View style={styles.actionBarDivider} />
                      ) : null}
                      {hasLocation ? (
                        <Pressable
                          style={({ pressed }) => [styles.actionBarBtn, pressed && { opacity: 0.6 }]}
                          onPress={() =>
                            Linking.openURL(
                              `https://www.google.com/maps/dir/?api=1&destination=${order.store_latitude},${order.store_longitude}`
                            )
                          }
                        >
                          <Feather name="navigation" size={14} color={colors.brandPrimary} />
                          <Text style={styles.actionBarText}>Directions</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}

                  {/* ── Items ── */}
                  <View style={styles.itemsDivider} />
                  <View style={styles.itemsBlock}>
                    {(order.order_items || []).map((oi) => (
                      <View key={oi.id} style={styles.itemRow}>
                        <Text style={styles.itemName} numberOfLines={2}>
                          {oi.quantity}× {oi.pickle_name}
                          {oi.variant_label ? ` (${oi.variant_label})` : ''}
                        </Text>
                        <Text style={styles.itemPrice}>₹{fmt(Number(oi.line_total_inr))}</Text>
                      </View>
                    ))}

                    {order.ready_date && (
                      <View style={styles.readyRow}>
                        <Feather name="clock" size={12} color={colors.success} />
                        <Text style={styles.readyDate}>
                          Ready: {new Date(order.ready_date).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    )}

                    {showPickup && (
                      <View style={styles.pickupBox}>
                        <View style={styles.pickupHeader}>
                          <Feather name="lock" size={13} color={colors.brandPrimary} />
                          <Text style={styles.pickupLabel}>PICKUP CODE</Text>
                        </View>
                        <View style={styles.pickupDivider} />
                        <Text style={styles.pickupCode}>{pickupCode(order.id)}</Text>
                        <Text style={styles.pickupHint}>Show this code to the seller</Text>
                      </View>
                    )}

                    {multiStore && (
                      <View style={styles.subtotalRow}>
                        <Text style={styles.subtotalLabel}>Store subtotal</Text>
                        <Text style={styles.subtotalVal}>₹{fmt(Number(order.total_inr))}</Text>
                      </View>
                    )}
                  </View>

                </View>
              );
            })}

            {/* ── Grand total ── */}
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

  // ── Header ──
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

  // ── Card ──
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  // ── Section ──
  storeSection: { overflow: 'hidden' },
  sectionDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },

  // ── Store info ──
  storeInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  storeImg: {
    width: 52, height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    flexShrink: 0,
  },
  storeImgPlaceholder: {
    width: 52, height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.brandPrimary + '14',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeMeta: { flex: 1, gap: 6 },
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  storeName: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface, flex: 1, lineHeight: 22 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, flexShrink: 0 },
  badgeText: { fontFamily: fonts.textBold, fontSize: 10, letterSpacing: 0.5 },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  storeAddr: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, flex: 1, lineHeight: 18 },

  // ── Action bar ──
  actionBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  actionBarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
  },
  actionBarDivider: { width: 1, backgroundColor: colors.border },
  actionBarText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.brandPrimary },

  // ── Items ──
  itemsDivider: { height: 1, backgroundColor: colors.border },
  itemsBlock: { padding: spacing.lg, gap: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  itemName: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary, flex: 1 },
  itemPrice: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface, flexShrink: 0 },

  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readyDate: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.success },

  pickupBox: {
    backgroundColor: colors.brandPrimary + '0D',
    borderWidth: 1.5,
    borderColor: colors.brandPrimary + '50',
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  pickupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickupLabel: { fontFamily: fonts.textBold, fontSize: 11, color: colors.brandPrimary, letterSpacing: 1.5 },
  pickupDivider: { width: '100%', height: 1, backgroundColor: colors.brandPrimary + '25', marginVertical: spacing.xs },
  pickupCode: { fontFamily: fonts.display, fontSize: 32, color: colors.brandPrimary, letterSpacing: 10 },
  pickupHint: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, marginTop: 2 },

  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  subtotalLabel: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.muted },
  subtotalVal: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface },

  // ── Total ──
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  totalVal: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },
});
