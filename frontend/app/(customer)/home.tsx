import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

interface Pickle {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  store_id: string;
  packaging_options: { id: string; label: string; price_inr: number }[];
}
interface Section { id: string; title: string; sort_order: number; items: Pickle[]; }

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1617854307432-13950e24ba07?w=600&q=80';

export default function CustomerHome() {
  const [sections, setSections] = useState<Section[]>([]);
  const [featured, setFeatured] = useState<Pickle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const { data: secs } = await supabase
      .from('home_sections')
      .select('id,title,sort_order,home_section_items(sort_order,pickle:pickles(id,name,description,image_url,store_id,packaging_options(id,label,price_inr,is_active)))')
      .eq('is_active', true)
      .order('sort_order');
    const built: Section[] = (secs || []).map((s: any) => ({
      id: s.id,
      title: s.title,
      sort_order: s.sort_order,
      items: (s.home_section_items || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((si: any) => si.pickle)
        .filter(Boolean),
    }));
    setSections(built);
    const firstItem = built.flatMap(s => s.items)[0];
    setFeatured(firstItem || null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.hi}>Namaste</Text>
            <Text style={styles.brand}>Venkat Ramana Pickles</Text>
          </View>
        </View>

        {featured ? (
          <Pressable testID="home-hero-card" onPress={() => router.push({ pathname: '/product/[id]', params: { id: featured.id } })}>
            <View style={styles.hero}>
              <Image source={featured.image_url || FALLBACK_IMG} style={styles.heroImg} contentFit="cover" />
              <LinearGradient colors={['transparent', 'rgba(45,36,33,0.85)']} style={styles.heroScrim} />
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroKicker}>FEATURED</Text>
                <Text style={styles.heroTitle}>{featured.name}</Text>
                {featured.description && <Text style={styles.heroDesc} numberOfLines={2}>{featured.description}</Text>}
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={styles.emptyHero}>
            <Text style={styles.emptyText}>Fresh batches being curated…</Text>
          </View>
        )}

        {sections.map(sec => (
          <View key={sec.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            {sec.items.length === 0 ? (
              <Text style={styles.emptySection}>Nothing here yet</Text>
            ) : (
              <FlatList
                data={sec.items}
                keyExtractor={i => i.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
                renderItem={({ item }) => {
                  const price = item.packaging_options?.[0]?.price_inr;
                  return (
                    <Pressable testID={`pickle-card-${item.id}`} onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })} style={styles.card}>
                      <Image source={item.image_url || FALLBACK_IMG} style={styles.cardImg} contentFit="cover" />
                      <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
                      {price !== undefined && <Text style={styles.cardPrice}>from ₹{price}</Text>}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        ))}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  headerRow: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg },
  hi: { fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  brand: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, marginTop: 2 },
  hero: { marginHorizontal: spacing.xl, height: 220, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceTertiary },
  heroImg: { width: '100%', height: '100%' },
  heroScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '75%' },
  heroTextWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  heroKicker: { color: colors.brandSecondary, fontFamily: fonts.textBold, fontSize: 11, letterSpacing: 2, marginBottom: spacing.xs },
  heroTitle: { color: colors.onSurfaceInverse, fontFamily: fonts.display, fontSize: 24 },
  heroDesc: { color: colors.onSurfaceInverse, fontFamily: fonts.text, fontSize: 13, marginTop: spacing.xs, opacity: 0.9 },
  emptyHero: { marginHorizontal: spacing.xl, height: 160, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.muted, fontFamily: fonts.text },
  section: { marginTop: spacing.xl },
  sectionTitle: { paddingHorizontal: spacing.xl, fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  emptySection: { paddingHorizontal: spacing.xl, color: colors.muted, fontFamily: fonts.text },
  card: { width: 160, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardImg: { width: '100%', height: 120, backgroundColor: colors.surfaceTertiary },
  cardTitle: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  cardPrice: { fontFamily: fonts.textBold, fontSize: 13, color: colors.brandPrimary, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, paddingTop: 2 },
});
