import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts, statusColors } from '@/src/lib/theme';

const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });

export default function SellerOrders() {
  const { profile } = useAuth();
  const router = useRouter();
  const isPrimary = profile?.role === 'primary_seller';

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.store_id) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select([
        'id,status,total_inr,ready_date,created_at,order_ref,assigned_to',
        'customer:user_profiles!orders_customer_id_fkey(full_name)',
        'assigned_seller:user_profiles!orders_assigned_to_fkey(full_name)',
        'order_items(pickle_name,variant_label,quantity)',
      ].join(','))
      .eq('store_id', profile.store_id)
      .order('created_at', { ascending: false });
    if (!error) setOrders(data ?? []);
    setLoading(false);
  }, [profile?.store_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.header}>{isPrimary ? 'Store Orders' : 'My Orders'}</Text>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isPrimary ? 'No orders yet.' : 'No orders assigned to you yet.'}
          </Text>
        }
        renderItem={({ item }) => {
          const s = statusColors[item.status] || { bg: colors.surfaceTertiary, fg: colors.onSurface, label: item.status };
          return (
            <Pressable
              testID={`seller-order-${item.id}`}
              onPress={() => router.push(`/seller-order/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              {/* Top row: customer + status */}
              <View style={styles.rowBetween}>
                <Text style={styles.customer}>{item.customer?.full_name || 'Customer'}</Text>
                <View style={[styles.badge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
                </View>
              </View>

              {/* Items summary */}
              {(item.order_items ?? []).slice(0, 2).map((oi: any, i: number) => (
                <Text key={i} style={styles.line} numberOfLines={1}>
                  {oi.quantity}× {oi.pickle_name}{oi.variant_label ? ` · ${oi.variant_label}` : ''}
                </Text>
              ))}
              {(item.order_items ?? []).length > 2 && (
                <Text style={styles.more}>+{item.order_items.length - 2} more items</Text>
              )}

              {/* Bottom row: date + total */}
              <View style={styles.rowBetween}>
                <Text style={styles.date}>{fmtDT(item.created_at)}</Text>
                <Text style={styles.total}>₹{Math.round(Number(item.total_inr)).toLocaleString('en-IN')}</Text>
              </View>

              {/* Ready date (if set) */}
              {item.ready_date && (
                <View style={styles.readyRow}>
                  <Feather name="clock" size={11} color={colors.success} />
                  <Text style={styles.readyText}>
                    Pickup: {new Date(item.ready_date).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
              )}

              {/* Assigned sub-seller (primary view) */}
              {isPrimary && item.assigned_seller && (
                <View style={styles.assignedRow}>
                  <Feather name="user-check" size={11} color={colors.brandPrimary} />
                  <Text style={styles.assignedText}>{item.assigned_seller.full_name}</Text>
                </View>
              )}

              {/* Tap hint */}
              <View style={styles.tapHint}>
                <Text style={styles.tapHintText}>Tap to manage</Text>
                <Feather name="chevron-right" size={12} color={colors.muted} />
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, padding: spacing.xl, paddingBottom: spacing.md },
  empty: { color: colors.muted, textAlign: 'center', fontFamily: fonts.text, marginTop: spacing.xl },

  card: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customer: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.textBold, fontSize: 10, letterSpacing: 0.5 },
  line: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary },
  more: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  date: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  total: { fontFamily: fonts.textBold, fontSize: 15, color: colors.brandPrimary },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  readyText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.success },
  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  assignedText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary },
  tapHint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs, marginTop: spacing.xs,
  },
  tapHintText: { fontFamily: fonts.text, fontSize: 11, color: colors.muted },
});
