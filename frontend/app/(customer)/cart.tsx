import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const FALLBACK = 'https://images.unsplash.com/photo-1617854307432-13950e24ba07?w=200&q=60';
const MAX_QTY = 5;
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

export default function Cart() {
  const { profile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('cart_items')
      .select(`
        id, quantity,
        pickle:pickles(id, name, image_url, store:stores(id, name)),
        variant_packaging:variant_packagings(
          id, selling_price_inr, packaging_cost, mrp_inr, discount_pct,
          variant_id,
          packaging_type:packaging_types(name, image_url)
        )
      `)
      .eq('customer_id', profile.id);

    if (error) {
      console.error('[cart] load error:', JSON.stringify(error));
      Alert.alert('Cart load failed', error.message);
      setLoading(false);
      return;
    }

    // PostgREST can't traverse the two-hop join to pickle_variants, so fetch labels separately
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

    const enriched = (data || []).map((it: any) => ({
      ...it,
      variant_packaging: it.variant_packaging ? {
        ...it.variant_packaging,
        variant: { label: variantLabels[it.variant_packaging.variant_id] ?? null },
      } : null,
    }));

    setItems(enriched);
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unitCost = (vp: any) =>
    Number(vp?.selling_price_inr ?? 0) + Number(vp?.packaging_cost ?? 0);

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

  const removeItem = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    await supabase.from('cart_items').delete().eq('id', id);
  };

  const changeQty = async (it: any, delta: number) => {
    const newQty = it.quantity + delta;
    if (newQty <= 0) { removeItem(it.id); return; }
    if (newQty > MAX_QTY) return;
    setItems(prev => prev.map(i => i.id === it.id ? { ...i, quantity: newQty } : i));
    await supabase.from('cart_items').update({ quantity: newQty }).eq('id', it.id);
  };


  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.header}>Your Basket</Text>
      {groupArr.length === 0 ? (
        <View style={styles.center}>
          <Feather name="shopping-bag" size={48} color={colors.borderStrong} />
          <Text style={styles.empty}>Your basket is empty.</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={groupArr}
            keyExtractor={(g) => g.store.id}
            contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}
            renderItem={({ item: g }) => (
              <View style={styles.storeGroup}>
                <View style={styles.storeHeader}>
                  <Feather name="map-pin" size={14} color={colors.brandPrimary} />
                  <Text style={styles.storeName}>{g.store.name}</Text>
                </View>

                {g.items.map((it: any) => {
                  const vp = it.variant_packaging;
                  const unit = unitCost(vp);
                  const lineTotal = unit * it.quantity;
                  const sizeLabel = vp?.variant?.label;
                  const pkgLabel = vp?.packaging_type?.name;

                  return (
                    <Pressable
                      key={it.id}
                      style={styles.itemRow}
                      onPress={() => router.push(`/product/${it.pickle?.id}?variantId=${it.variant_packaging?.variant_id}&packagingId=${it.variant_packaging?.id}`)}
                    >
                      <Image
                        source={it.pickle?.image_url || FALLBACK}
                        style={styles.itemThumb}
                        contentFit="cover"
                      />

                      <View style={styles.itemBody}>
                        <View style={styles.itemTopRow}>
                          <Text style={styles.itemName} numberOfLines={2}>{it.pickle?.name}</Text>
                          <View style={styles.stepper}>
                            <Pressable
                              onPress={() => changeQty(it, -1)}
                              style={styles.stepBtn}
                              hitSlop={6}
                            >
                              <Feather name="minus" size={11} color={colors.brandPrimary} />
                            </Pressable>
                            <Text style={styles.stepQty}>{it.quantity}</Text>
                            <Pressable
                              onPress={() => changeQty(it, 1)}
                              disabled={it.quantity >= MAX_QTY}
                              style={[styles.stepBtn, it.quantity >= MAX_QTY && styles.stepBtnDisabled]}
                              hitSlop={6}
                            >
                              <Feather name="plus" size={11} color={colors.brandPrimary} />
                            </Pressable>
                          </View>
                        </View>

                        <View style={styles.itemMeta}>
                          <View style={styles.labelCol}>
                            {sizeLabel ? <Text style={styles.sizeChip}>{sizeLabel}</Text> : null}
                            {pkgLabel ? (
                              <View style={styles.pkgChip}>
                                {vp?.packaging_type?.image_url ? (
                                  <Image
                                    source={vp.packaging_type.image_url}
                                    style={styles.pkgImage}
                                    contentFit="contain"
                                  />
                                ) : null}
                                <Text style={styles.itemLabel}>{pkgLabel}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.itemPrice}>₹{fmt(lineTotal)}</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}

                <View style={styles.subRow}>
                  <Text style={styles.subLabel}>Subtotal</Text>
                  <Text style={styles.subVal}>₹{fmt(g.subtotal)}</Text>
                </View>
              </View>
            )}
          />

          <View style={styles.checkoutBar}>
            <View>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalVal}>₹{fmt(total)}</Text>
            </View>
            <Pressable
              testID="checkout-button"
              onPress={() => router.push('/checkout')}
              style={styles.btn}
            >
              <Text style={styles.btnText}>Checkout →</Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, padding: spacing.xl, paddingBottom: spacing.md },
  empty: { color: colors.muted, marginTop: spacing.md, fontFamily: fonts.text },

  storeGroup: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  storeName: { fontFamily: fonts.textBold, color: colors.onSurface, fontSize: 14 },

  itemRow: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  itemThumb: { aspectRatio: 1, alignSelf: 'stretch', borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary, flexShrink: 0 },
  itemBody: { flex: 1, gap: 4 },
  itemTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  itemName: { fontFamily: fonts.textMedium, color: colors.onSurface, fontSize: 14, flex: 1 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelCol: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  sizeChip: { fontFamily: fonts.textBold, fontSize: 12, color: colors.brandPrimary, backgroundColor: colors.brandPrimary + '18', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  pkgChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pkgImage: { width: 18, height: 18, borderRadius: 3 },
  itemLabel: { fontFamily: fonts.text, color: colors.muted, fontSize: 12 },

  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.brandPrimary, borderRadius: 6, overflow: 'hidden' },
  stepBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPrimary + '15' },
  stepBtnDisabled: { opacity: 0.4 },
  stepQty: { fontFamily: fonts.textBold, fontSize: 12, color: colors.brandPrimary, minWidth: 16, textAlign: 'center' },

  itemPrice: { fontFamily: fonts.textBold, color: colors.onSurface, fontSize: 14 },

  subRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm },
  subLabel: { fontFamily: fonts.text, color: colors.muted },
  subVal: { fontFamily: fonts.textBold, color: colors.onSurface },

  checkoutBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  totalLabel: { fontFamily: fonts.text, color: colors.muted, fontSize: 12 },
  totalVal: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 22 },
  btn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flex: 1, alignItems: 'center', maxWidth: 220 },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 14 },
});
