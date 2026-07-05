import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

export default function SellerDashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile?.store_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: d, error } = await supabase.rpc('store_analytics', { p_store_id: profile.store_id });
      if (error) throw error;
      setData(d);
    } catch {}
    setLoading(false);
  }, [profile?.store_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  if (!profile?.store_id) {
    return (
      <SafeAreaView style={styles.safe}><View style={styles.center}>
        <Text style={styles.warn}>You are not assigned to a store yet. Ask your admin.</Text>
      </View></SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>{profile.role === 'primary_seller' ? 'Primary Seller' : 'Sub-Seller'}</Text>
        <View style={styles.grid}>
          <Metric label="Total Orders" value={data?.total_orders ?? 0} testID="metric-total-orders" />
          <Metric label="Active" value={data?.active_orders ?? 0} testID="metric-active-orders" accent />
          <Metric label="Completed" value={data?.completed_orders ?? 0} testID="metric-completed" />
          <Metric label="Revenue" value={`₹${Number(data?.total_revenue || 0).toFixed(0)}`} testID="metric-revenue" accent />
        </View>
        <Text style={styles.section}>Top Products</Text>
        {(data?.top_products || []).length === 0 ? (
          <Text style={styles.empty}>No sales yet.</Text>
        ) : (data?.top_products || []).map((p: any, i: number) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rank}>#{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.pname}>{p.name}</Text>
              <Text style={styles.pmeta}>{p.qty} sold</Text>
            </View>
            <Text style={styles.prev}>₹{Number(p.revenue).toFixed(0)}</Text>
          </View>
        ))}
        <Text style={styles.section}>Status Breakdown</Text>
        {Object.entries(data?.status_breakdown || {}).map(([k, v]) => (
          <View key={k} style={styles.statusRow}>
            <Text style={styles.statusK}>{k.replace(/_/g, ' ')}</Text>
            <Text style={styles.statusV}>{String(v)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, accent, testID }: any) {
  return (
    <View testID={testID} style={[styles.card, accent && { backgroundColor: colors.surfaceInverse }]}>
      <Text style={[styles.mLabel, accent && { color: colors.onSurfaceInverse, opacity: 0.7 }]}>{label}</Text>
      <Text style={[styles.mVal, accent && { color: colors.onSurfaceInverse }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  warn: { fontFamily: fonts.text, color: colors.muted, textAlign: 'center' },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.onSurface },
  subtitle: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary, letterSpacing: 1.5, marginTop: 2, marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { width: '48%', backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg },
  mLabel: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginBottom: spacing.xs },
  mVal: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  section: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
  empty: { fontFamily: fonts.text, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { fontFamily: fonts.display, fontSize: 16, color: colors.brandPrimary, width: 32 },
  pname: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface },
  pmeta: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  prev: { fontFamily: fonts.textBold, color: colors.brandPrimary, fontSize: 14 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  statusK: { fontFamily: fonts.text, color: colors.onSurfaceTertiary, textTransform: 'capitalize' },
  statusV: { fontFamily: fonts.textBold, color: colors.onSurface },
});
