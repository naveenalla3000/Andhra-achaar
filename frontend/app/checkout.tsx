import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const FALLBACK = 'https://images.unsplash.com/photo-1617854307432-13950e24ba07?w=200&q=60';
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
const unitCost = (vp: any) =>
  Number(vp?.selling_price_inr ?? 0) + Number(vp?.packaging_cost ?? 0);

export default function Checkout() {
  const { profile } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('cart_items')
      .select(`
        id, quantity,
        pickle:pickles(id, name, image_url, store:stores(id, name)),
        variant_packaging:variant_packagings(
          id, selling_price_inr, packaging_cost,
          variant_id,
          packaging_type:packaging_types(name, image_url)
        )
      `)
      .eq('customer_id', profile.id);

    if (error) { setLoading(false); return; }

    const variantIds = [...new Set(
      (data || []).map((it: any) => it.variant_packaging?.variant_id).filter(Boolean)
    )] as string[];
    let variantLabels: Record<string, string> = {};
    if (variantIds.length > 0) {
      const { data: variants } = await supabase
        .from('pickle_variants')
        .select('id, label')
        .in('id', variantIds);
      variantLabels = Object.fromEntries((variants || []).map((v: any) => [v.id, v.label]));
    }

    setItems((data || []).map((it: any) => ({
      ...it,
      variant_packaging: it.variant_packaging ? {
        ...it.variant_packaging,
        variant: { label: variantLabels[it.variant_packaging.variant_id] ?? null },
      } : null,
    })));
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const groups = items.reduce((acc: any, it: any) => {
    const s = it.pickle?.store;
    if (!s) return acc;
    acc[s.id] = acc[s.id] || { store: s, items: [], subtotal: 0 };
    acc[s.id].items.push(it);
    acc[s.id].subtotal += unitCost(it.variant_packaging) * it.quantity;
    return acc;
  }, {} as Record<string, any>);
  const groupArr: any[] = Object.values(groups);
  const total = groupArr.reduce((sum, g) => sum + g.subtotal, 0);

  const placeOrder = async () => {
    setPlacing(true);
    try {
      const { error } = await supabase.rpc('checkout');
      if (error) throw error;
      Alert.alert(
        'Order placed!',
        'Your order is confirmed. Please pay at the store when you pick up.',
        [{ text: 'View Orders', onPress: () => router.replace('/(customer)/account') }],
      );
    } catch (e: any) {
      Alert.alert('Order failed', e.message || 'Please try again');
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.header}>Review Order</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Order items grouped by store */}
        {groupArr.map(g => (
          <View key={g.store.id} style={styles.storeCard}>
            <View style={styles.storeHeader}>
              <View style={styles.storeIconWrap}>
                <Feather name="map-pin" size={14} color={colors.brandPrimary} />
              </View>
              <Text style={styles.storeName}>{g.store.name}</Text>
            </View>

            {g.items.map((it: any) => {
              const vp = it.variant_packaging;
              const unit = unitCost(vp);
              const lineTotal = unit * it.quantity;
              const sizeLabel = vp?.variant?.label;
              const pkgLabel = vp?.packaging_type?.name;
              const pkgImage = vp?.packaging_type?.image_url;

              return (
                <View key={it.id} style={styles.itemRow}>
                  <Image
                    source={it.pickle?.image_url || FALLBACK}
                    style={styles.itemThumb}
                    contentFit="cover"
                  />
                  <View style={styles.itemBody}>
                    <Text style={styles.itemName} numberOfLines={2}>{it.pickle?.name}</Text>
                    <View style={styles.labelCol}>
                      {sizeLabel ? <Text style={styles.sizeChip}>{sizeLabel}</Text> : null}
                      {pkgLabel ? (
                        <View style={styles.pkgChip}>
                          {pkgImage ? (
                            <Image source={pkgImage} style={styles.pkgImage} contentFit="contain" />
                          ) : null}
                          <Text style={styles.pkgLabel}>{pkgLabel}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.qtyPrice}>
                    <Text style={styles.qtyBadge}>×{it.quantity}</Text>
                    <Text style={styles.lineTotal}>₹{fmt(lineTotal)}</Text>
                  </View>
                </View>
              );
            })}

            <View style={styles.divider} />

            <View style={styles.subRow}>
              <Text style={styles.subLabel}>Subtotal</Text>
              <Text style={styles.subVal}>₹{fmt(g.subtotal)}</Text>
            </View>

            <View style={styles.pickupBanner}>
              <Feather name="shopping-bag" size={13} color={colors.brandPrimary} />
              <Text style={styles.pickupText}>Pickup · Pay at store</Text>
            </View>
          </View>
        ))}

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="Any special instructions? (optional)"
            placeholderTextColor={colors.muted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Price breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Summary</Text>
          <View style={styles.priceCard}>
            {groupArr.map(g => (
              <View key={g.store.id} style={styles.priceRow}>
                <Text style={styles.priceLabel}>{g.store.name}</Text>
                <Text style={styles.priceVal}>₹{fmt(g.subtotal)}</Text>
              </View>
            ))}
            <View style={styles.priceDivider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceTotalLabel}>Total</Text>
              <Text style={styles.priceTotalVal}>₹{fmt(total)}</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky bottom bar */}
      <View style={styles.bar}>
        <View>
          <Text style={styles.barLabel}>Total</Text>
          <Text style={styles.barTotal}>₹{fmt(total)}</Text>
        </View>
        <Pressable
          onPress={placeOrder}
          disabled={placing || items.length === 0}
          style={[styles.placeBtn, (placing || items.length === 0) && { opacity: 0.6 }]}
        >
          {placing
            ? <ActivityIndicator color={colors.onBrandPrimary} />
            : <Text style={styles.placeBtnText}>Place Order</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  header: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },

  scroll: { padding: spacing.lg, paddingTop: spacing.sm },

  storeCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  storeIconWrap: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandPrimary + '15', alignItems: 'center', justifyContent: 'center' },
  storeName: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },

  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  itemThumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, flexShrink: 0 },
  itemBody: { flex: 1, gap: 4 },
  itemName: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  labelCol: { flexDirection: 'column', alignItems: 'flex-start', gap: 3 },
  sizeChip: { fontFamily: fonts.textBold, fontSize: 11, color: colors.brandPrimary, backgroundColor: colors.brandPrimary + '18', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  pkgChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pkgImage: { width: 16, height: 16, borderRadius: 3 },
  pkgLabel: { fontFamily: fonts.text, fontSize: 11, color: colors.muted },

  qtyPrice: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  qtyBadge: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  lineTotal: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },

  divider: { height: 1, backgroundColor: colors.border, marginTop: spacing.sm },

  subRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
  subLabel: { fontFamily: fonts.text, color: colors.muted, fontSize: 13 },
  subVal: { fontFamily: fonts.textBold, color: colors.onSurface, fontSize: 13 },

  pickupBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, backgroundColor: colors.brandPrimary + '10', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pickupText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary },

  section: { marginBottom: spacing.md },
  sectionTitle: { fontFamily: fonts.textBold, fontSize: 11, color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.sm },

  notesInput: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, fontSize: 14, color: colors.onSurface, minHeight: 80 },

  priceCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  priceLabel: { fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  priceVal: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  priceDivider: { height: 1, backgroundColor: colors.border },
  priceTotalLabel: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  priceTotalVal: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  barLabel: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  barTotal: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  placeBtn: { flex: 1, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', maxWidth: 200 },
  placeBtnText: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onBrandPrimary },
});
