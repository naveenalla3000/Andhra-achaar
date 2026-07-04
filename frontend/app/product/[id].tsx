import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const FALLBACK = 'https://images.unsplash.com/photo-1617854307432-13950e24ba07?w=800&q=80';

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<any>(null);
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const { profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('pickles')
        .select('*,store:stores(id,name),packaging_options(id,label,price_inr,is_active)')
        .eq('id', id).maybeSingle();
      setProduct(data);
      const first = data?.packaging_options?.find((p: any) => p.is_active !== false);
      setSelectedPkg(first?.id || null);
      setLoading(false);
    })();
  }, [id]);

  const addToCart = async () => {
    if (!profile || profile.role !== 'customer') {
      Alert.alert('Sign in as customer to order'); return;
    }
    if (!selectedPkg) return;
    setAdding(true);
    const { error } = await supabase.from('cart_items').upsert({
      customer_id: profile.id, pickle_id: product.id, packaging_id: selectedPkg, quantity: qty,
    }, { onConflict: 'customer_id,pickle_id,packaging_id' });
    setAdding(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Added to cart');
  };

  if (loading || !product) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const pkgs = (product.packaging_options || []).filter((p: any) => p.is_active !== false);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <Image source={product.image_url || FALLBACK} style={styles.hero} contentFit="cover" />
          <LinearGradient colors={['rgba(0,0,0,0.4)', 'transparent']} style={styles.topScrim} />
          <Pressable testID="back-button" onPress={() => router.back()} style={styles.back}>
            <Feather name="chevron-left" size={24} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.body}>
          <Text style={styles.store}>{product.store?.name}</Text>
          <Text style={styles.name}>{product.name}</Text>
          {product.description && <Text style={styles.desc}>{product.description}</Text>}
          {product.ingredients && <>
            <Text style={styles.sec}>Ingredients</Text>
            <Text style={styles.desc}>{product.ingredients}</Text>
          </>}
          <Text style={styles.sec}>Select Packaging</Text>
          <View style={styles.chips}>
            {pkgs.map((p: any) => {
              const active = selectedPkg === p.id;
              return (
                <Pressable key={p.id} testID={`pkg-${p.id}`} onPress={() => setSelectedPkg(p.id)}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                  <Text style={[styles.chipPrice, active && styles.chipPriceActive]}>₹{p.price_inr}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.sec}>Quantity</Text>
          <View style={styles.qtyRow}>
            <Pressable testID="qty-dec" onPress={() => setQty(Math.max(1, qty - 1))} style={styles.qtyBtn}><Feather name="minus" size={16} color={colors.onSurface} /></Pressable>
            <Text style={styles.qtyText}>{qty}</Text>
            <Pressable testID="qty-inc" onPress={() => setQty(qty + 1)} style={styles.qtyBtn}><Feather name="plus" size={16} color={colors.onSurface} /></Pressable>
          </View>
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
      <View style={styles.bar}>
        <Pressable testID="add-to-cart" onPress={addToCart} disabled={adding || !selectedPkg} style={[styles.cta, (adding || !selectedPkg) && { opacity: 0.6 }]}>
          {adding ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Add to Cart</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  heroWrap: { height: 320, backgroundColor: colors.surfaceTertiary },
  hero: { width: '100%', height: '100%' },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0, height: 80 },
  back: { position: 'absolute', top: 48, left: spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.xl },
  store: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary, letterSpacing: 1.5, textTransform: 'uppercase' },
  name: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface, marginTop: spacing.xs },
  desc: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 21 },
  sec: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.sm, letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  chipText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  chipTextActive: { color: colors.onBrandTertiary },
  chipPrice: { fontFamily: fonts.textBold, fontSize: 13, color: colors.muted },
  chipPriceActive: { color: colors.brandPrimary },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontFamily: fonts.textBold, fontSize: 18, color: colors.onSurface, minWidth: 30, textAlign: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  ctaText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 15 },
});
