import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const FALLBACK = 'https://images.unsplash.com/photo-1613271596363-4fb96ef16eac?w=400&q=80';

export default function StoreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [store, setStore] = useState<any>(null);
  const [pickles, setPickles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from('stores').select('*').eq('id', id).maybeSingle();
      setStore(s);
      const { data: p } = await supabase
        .from('pickles')
        .select('*,packaging_options(price_inr,is_active)')
        .eq('store_id', id).eq('is_active', true);
      setPickles(p || []); setLoading(false);
    })();
  }, [id]);

  if (loading || !store) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable testID="back-button" onPress={() => router.back()}><Feather name="chevron-left" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.title} numberOfLines={1}>{store.name}</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={pickles}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.xl }}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xxxl }}
        ListHeaderComponent={
          <View style={styles.infoCard}>
            <View style={styles.row}><Feather name="map-pin" size={14} color={colors.muted} /><Text style={styles.rowText}>{store.address}</Text></View>
            <View style={styles.row}><Feather name="clock" size={14} color={colors.muted} /><Text style={styles.rowText}>{store.opens_at} – {store.closes_at}</Text></View>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>No pickles yet.</Text>}
        renderItem={({ item }) => {
          const price = item.packaging_options?.[0]?.price_inr;
          return (
            <Pressable testID={`pickle-${item.id}`} onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })} style={styles.card}>
              <Image source={item.image_url || FALLBACK} style={styles.img} contentFit="cover" />
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              {price !== undefined && <Text style={styles.price}>from ₹{price}</Text>}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  title: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },
  infoCard: { margin: spacing.xl, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  row: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center', marginVertical: 2 },
  rowText: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary, flex: 1 },
  card: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  img: { width: '100%', height: 140, backgroundColor: colors.surfaceTertiary },
  name: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  price: { fontFamily: fonts.textBold, fontSize: 13, color: colors.brandPrimary, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, paddingTop: 2 },
  empty: { color: colors.muted, textAlign: 'center', fontFamily: fonts.text, marginTop: spacing.xl },
});
