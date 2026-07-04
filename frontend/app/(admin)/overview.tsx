import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

export default function AdminOverview() {
  const { profile, signOut } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch('/analytics/admin'); setData(d); } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <Text style={styles.title}>Admin</Text>
        <Text style={styles.subtitle}>{profile?.full_name}</Text>
        <View style={styles.grid}>
          <Metric label="Stores" value={data?.total_stores ?? 0} testID="metric-stores" />
          <Metric label="Active" value={data?.active_stores ?? 0} testID="metric-active-stores" accent />
          <Metric label="Total Orders" value={data?.total_orders ?? 0} testID="metric-orders" />
          <Metric label="Revenue" value={`₹${Number(data?.total_revenue || 0).toFixed(0)}`} testID="metric-revenue" accent />
          <Metric label="Customers" value={data?.total_customers ?? 0} testID="metric-customers" />
          <Metric label="Sellers" value={data?.total_sellers ?? 0} testID="metric-sellers" />
        </View>
        <Pressable testID="signout-button" onPress={signOut} style={styles.signout}>
          <Text style={styles.signoutText}>Sign out</Text>
        </Pressable>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  subtitle: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary, marginTop: 2, marginBottom: spacing.lg, letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { width: '48%', backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg },
  mLabel: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginBottom: spacing.xs },
  mVal: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  signout: { marginTop: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  signoutText: { fontFamily: fonts.textMedium, color: colors.onSurface },
});
