import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts, statusColors } from '@/src/lib/theme';

export default function Account() {
  const { profile, signOut } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('id,status,total_inr,ready_date,created_at,store:stores(name),order_items(pickle_name,packaging_label,quantity,line_total_inr)')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false });
    setOrders(data || []); setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{profile?.full_name || 'Guest'}</Text>
          <Text style={styles.role}>{profile?.role.toUpperCase()}</Text>
        </View>
        <Pressable testID="signout-button" onPress={signOut} style={styles.signout}>
          <Text style={styles.signoutText}>Sign out</Text>
        </Pressable>
      </View>
      <Text style={styles.section}>Your Orders</Text>
      {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} /> : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl }}
          ListEmptyComponent={<Text style={styles.empty}>No orders yet.</Text>}
          renderItem={({ item }) => {
            const s = statusColors[item.status] || { bg: colors.surfaceTertiary, fg: colors.onSurface, label: item.status };
            return (
              <View style={styles.card} testID={`order-card-${item.id}`}>
                <View style={styles.rowBetween}>
                  <Text style={styles.store}>{item.store?.name}</Text>
                  <View style={[styles.badge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
                  </View>
                </View>
                {(item.order_items || []).map((oi: any, idx: number) => (
                  <Text key={idx} style={styles.line}>{oi.quantity}× {oi.pickle_name} ({oi.packaging_label})</Text>
                ))}
                <View style={styles.rowBetween}>
                  <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
                  <Text style={styles.total}>₹{Number(item.total_inr).toFixed(0)}</Text>
                </View>
                {item.ready_date && <Text style={styles.ready}>Ready on {item.ready_date}</Text>}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerRow: { padding: spacing.xl, flexDirection: 'row', alignItems: 'center' },
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  role: { fontFamily: fonts.textMedium, fontSize: 11, color: colors.brandPrimary, letterSpacing: 1.5, marginTop: 2 },
  signout: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  signoutText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurface },
  section: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  empty: { color: colors.muted, fontFamily: fonts.text, textAlign: 'center', marginTop: spacing.xl },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  store: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.textBold, fontSize: 10, letterSpacing: 0.5 },
  line: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary },
  date: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  total: { fontFamily: fonts.textBold, fontSize: 15, color: colors.brandPrimary },
  ready: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.success, marginTop: spacing.xs },
});
