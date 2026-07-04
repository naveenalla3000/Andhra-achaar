import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase, apiFetch } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

export default function Cart() {
  const { profile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('cart_items')
      .select('id,quantity,pickle:pickles(id,name,image_url,store_id,store:stores(id,name)),packaging:packaging_options(id,label,price_inr)')
      .eq('customer_id', profile.id);
    setItems(data || []); setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const groups = items.reduce((acc: any, it: any) => {
    const s = it.pickle.store; const key = s.id;
    acc[key] = acc[key] || { store: s, items: [], subtotal: 0 };
    acc[key].items.push(it);
    acc[key].subtotal += Number(it.packaging.price_inr) * it.quantity;
    return acc;
  }, {} as Record<string, any>);
  const groupArr: any[] = Object.values(groups);
  const total = groupArr.reduce((sum, g) => sum + g.subtotal, 0);

  const removeItem = async (id: string) => {
    await supabase.from('cart_items').delete().eq('id', id); load();
  };

  const checkout = async () => {
    setPlacing(true);
    try {
      await apiFetch('/orders/checkout', { method: 'POST', body: JSON.stringify({}) });
      Alert.alert('Order placed', 'Please pay at the store when you pick up.');
      router.replace('/(customer)/account');
    } catch (e: any) {
      Alert.alert('Checkout failed', e.message || 'Please try again');
    } finally { setPlacing(false); }
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
                {g.items.map((it: any) => (
                  <View key={it.id} style={styles.itemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{it.pickle.name}</Text>
                      <Text style={styles.itemMeta}>{it.packaging.label} · ×{it.quantity}</Text>
                    </View>
                    <Text style={styles.itemPrice}>₹{(Number(it.packaging.price_inr) * it.quantity).toFixed(0)}</Text>
                    <Pressable testID={`cart-remove-${it.id}`} onPress={() => removeItem(it.id)} style={styles.removeBtn}>
                      <Feather name="x" size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                ))}
                <View style={styles.subRow}>
                  <Text style={styles.subLabel}>Subtotal</Text>
                  <Text style={styles.subVal}>₹{g.subtotal.toFixed(0)}</Text>
                </View>
              </View>
            )}
          />
          <View style={styles.checkoutBar}>
            <View>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalVal}>₹{total.toFixed(0)}</Text>
            </View>
            <Pressable testID="checkout-button" onPress={checkout} disabled={placing} style={[styles.btn, placing && { opacity: 0.6 }]}>
              {placing ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Confirm · Pay at Store</Text>}
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
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.md },
  itemName: { fontFamily: fonts.textMedium, color: colors.onSurface, fontSize: 14 },
  itemMeta: { fontFamily: fonts.text, color: colors.muted, fontSize: 12, marginTop: 2 },
  itemPrice: { fontFamily: fonts.textBold, color: colors.onSurface, fontSize: 14 },
  removeBtn: { padding: spacing.sm },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm },
  subLabel: { fontFamily: fonts.text, color: colors.muted },
  subVal: { fontFamily: fonts.textBold, color: colors.onSurface },
  checkoutBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  totalLabel: { fontFamily: fonts.text, color: colors.muted, fontSize: 12 },
  totalVal: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 22 },
  btn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flex: 1, alignItems: 'center', maxWidth: 220 },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 14 },
});
