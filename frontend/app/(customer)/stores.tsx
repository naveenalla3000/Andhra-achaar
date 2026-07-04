import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

export default function Stores() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stores').select('*').eq('is_active', true).order('name');
      setStores(data || []); setLoading(false);
    })();
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.header}>Our Stores</Text>
      <FlatList
        data={stores}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxxl }}
        ListEmptyComponent={<Text style={styles.empty}>No stores available yet. Admin needs to add them.</Text>}
        renderItem={({ item }) => (
          <Pressable testID={`store-card-${item.id}`} style={styles.card} onPress={() => router.push({ pathname: '/store/[id]', params: { id: item.id } })}>
            <Text style={styles.name}>{item.name}</Text>
            <View style={styles.row}><Feather name="map-pin" size={14} color={colors.muted} /><Text style={styles.rowText}>{item.address}</Text></View>
            <View style={styles.row}><Feather name="clock" size={14} color={colors.muted} /><Text style={styles.rowText}>{item.opens_at} – {item.closes_at}</Text></View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  header: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, padding: spacing.xl, paddingBottom: spacing.md },
  card: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  name: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  rowText: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary, flex: 1 },
  empty: { color: colors.muted, textAlign: 'center', fontFamily: fonts.text, marginTop: spacing.xl },
});
