import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  FlatList, RefreshControl, useWindowDimensions, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Dropdown } from 'react-native-element-dropdown';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

interface VariantOption {
  vpId: string;
  variantId: string;
  label: string;
  selling_price_inr: number;
  mrp_inr: number | null;
  discount_pct: number | null;
}
interface Pickle {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  store_id: string;
  price_inr: number;
  is_veg: boolean | null;
  first_vp_id: string | null;
  first_variant_label: string | null;
  selling_price_inr: number | null;
  mrp_inr: number | null;
  discount_pct: number | null;
  options: VariantOption[];
}
interface Banner { id: string; image_url: string }
interface Section {
  id: string; title: string; description: string | null;
  layout_type: string; sort_order: number;
  banner_top_url: string | null; banner_bottom_url: string | null;
  items: Pickle[];
}

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1617854307432-13950e24ba07?w=600&q=80';

function toPickle(p: any): Pickle {
  const variants = ((p.pickle_variants || []) as any[])
    .filter((v: any) => v.is_active)
    .sort((a: any, b: any) => a.label.localeCompare(b.label));
  const firstV = variants[0] ?? null;
  const pkgs = firstV
    ? ((firstV.variant_packagings || []) as any[]).filter((vp: any) => vp.is_active)
    : [];
  const firstP = pkgs[0] ?? null;
  const options: VariantOption[] = variants.flatMap((v: any) =>
    ((v.variant_packagings || []) as any[])
      .filter((vp: any) => vp.is_active)
      .map((vp: any) => ({
        vpId: vp.id,
        variantId: v.id,
        label: v.label,
        selling_price_inr: vp.selling_price_inr ?? 0,
        mrp_inr: vp.mrp_inr ?? null,
        discount_pct: vp.discount_pct ?? null,
      }))
  );
  return {
    id: p.id, name: p.name, description: p.description,
    image_url: p.image_url, store_id: p.store_id, price_inr: p.price_inr ?? 0,
    is_veg: p.is_veg ?? null,
    first_vp_id: firstP?.id ?? null,
    first_variant_label: firstV?.label ?? null,
    selling_price_inr: firstP?.selling_price_inr ?? null,
    mrp_inr: firstP?.mrp_inr ?? null,
    discount_pct: firstP?.discount_pct ?? null,
    options,
  };
}

// ── Card sub-components ─────────────────────────────────────────────────────

function VegIndicator({ isVeg }: { isVeg: boolean | null }) {
  if (isVeg == null) return null;
  const c = isVeg ? '#22a722' : '#d0021b';
  return (
    <View style={[styles.vegBox, { borderColor: c }]}>
      <View style={[styles.vegDot, { backgroundColor: c }]} />
    </View>
  );
}

function CardPriceRow({ selling, mrp, discount }: {
  selling: number; mrp: number | null; discount: number | null;
}) {
  return (
    <View style={styles.priceRow}>
      <Text style={styles.sellingPrice}>₹{selling}</Text>
      {mrp != null && mrp > selling && <Text style={styles.mrpStrike}>₹{mrp}</Text>}
    </View>
  );
}

type AddFn = (item: Pickle, vpId: string) => void;
type DeltaFn = (vpId: string, currentQty: number, delta: number) => void;

function CardAddArea({ item, vpId, qty, onAdd, onDelta }: {
  item: Pickle; vpId: string | null; qty: number; onAdd: AddFn; onDelta: DeltaFn;
}) {
  if (!vpId) return null;
  if (qty > 0) {
    return (
      <View style={styles.stepper}>
        <Pressable hitSlop={8} style={styles.stepBtn}
          onPress={() => onDelta(vpId, qty, -1)}>
          <Feather name="minus" size={11} color={colors.brandPrimary} />
        </Pressable>
        <Text style={styles.stepQty}>{qty}</Text>
        <Pressable hitSlop={8} style={styles.stepBtn}
          onPress={() => onDelta(vpId, qty, 1)}>
          <Feather name="plus" size={11} color={colors.brandPrimary} />
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable style={styles.addBtn} onPress={() => onAdd(item, vpId)}>
      <Feather name="plus" size={11} color={colors.brandPrimary} />
      <Text style={styles.addBtnText}>Add</Text>
    </Pressable>
  );
}

function PickleCard({ item, layout = 'card', cartMap, onAdd, onDelta, onPress }: {
  item: Pickle; layout?: 'card' | 'grid' | 'list';
  cartMap: Record<string, number>;
  onAdd: AddFn; onDelta: DeltaFn;
  onPress: (id: string, variantId: string, packagingId: string) => void;
}) {
  const [selectedVpId, setSelectedVpId] = useState<string | null>(item.first_vp_id);

  const selectedOption = item.options.find(o => o.vpId === selectedVpId) ?? item.options[0] ?? null;
  const qty = selectedVpId ? (cartMap[selectedVpId] ?? 0) : 0;

  const variantControl = item.options.length > 1 ? (
    <Dropdown
      style={styles.variantChip}
      data={item.options}
      labelField="label"
      valueField="vpId"
      value={selectedVpId}
      onChange={opt => setSelectedVpId((opt as VariantOption).vpId)}
      selectedTextStyle={styles.variantChipText}
      containerStyle={styles.ddContainer}
      itemTextStyle={styles.ddLabel}
      activeColor={colors.brandPrimary + '18'}
      renderRightIcon={() => <Feather name="chevron-down" size={9} color={colors.muted} />}
      maxHeight={200}
      dropdownPosition="auto"
    />
  ) : item.options.length === 1 ? (
    <View style={styles.variantChip}>
      <Text style={styles.variantChipText} numberOfLines={1}>{item.options[0].label}</Text>
    </View>
  ) : null;

  const footer = (
    <View style={styles.cardFooter}>
      {variantControl ?? <View />}
      <CardAddArea item={item} vpId={selectedVpId} qty={qty} onAdd={onAdd} onDelta={onDelta} />
    </View>
  );

  if (layout === 'list') {
    return (
      <Pressable testID={`pickle-card-${item.id}`} onPress={() => onPress(item.id, selectedOption?.variantId ?? '', selectedVpId ?? '')} style={styles.listRow}>
        <View style={styles.listImgWrap}>
          <Image source={item.image_url || FALLBACK_IMG} style={styles.listImg} contentFit="cover" />
          {selectedOption?.discount_pct != null && selectedOption.discount_pct > 0 && (
            <View style={styles.listDiscountBadge}>
              <Text style={styles.listDiscountText}>{selectedOption.discount_pct}% off</Text>
            </View>
          )}
        </View>
        <View style={styles.listInfo}>
          <View style={styles.nameRow}>
            <VegIndicator isVeg={item.is_veg} />
            <Text style={styles.listName} numberOfLines={2}>{item.name}</Text>
          </View>
          {selectedOption && selectedOption.selling_price_inr > 0 && (
            <CardPriceRow selling={selectedOption.selling_price_inr} mrp={selectedOption.mrp_inr} discount={null} />
          )}
          {footer}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable testID={`pickle-card-${item.id}`} onPress={() => onPress(item.id, selectedOption?.variantId ?? '', selectedVpId ?? '')}
      style={layout === 'grid' ? styles.gridCard : styles.card}>
      <View>
        <Image source={item.image_url || FALLBACK_IMG}
          style={layout === 'grid' ? styles.gridCardImg : styles.cardImg} contentFit="cover" />
        {selectedOption?.discount_pct != null && selectedOption.discount_pct > 0 && (
          <View style={styles.listDiscountBadge}>
            <Text style={styles.listDiscountText}>{selectedOption.discount_pct}% off</Text>
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <View style={styles.nameRow}>
          <VegIndicator isVeg={item.is_veg} />
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        </View>
        {selectedOption && selectedOption.selling_price_inr > 0 && (
          <CardPriceRow selling={selectedOption.selling_price_inr} mrp={selectedOption.mrp_inr} discount={null} />
        )}
        {footer}
      </View>
    </Pressable>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function CustomerHome() {
  const { width } = useWindowDimensions();
  const { profile } = useAuth();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerIndexRef = useRef(0);
  const bannerRef = useRef<FlatList>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cartMap, setCartMap] = useState<Record<string, number>>({});
  const router = useRouter();

  const load = useCallback(async () => {
    const [{ data: bannerData }, { data: secs }] = await Promise.all([
      supabase.from('banners').select('id,image_url').eq('is_active', true).order('sort_order'),
      supabase.from('home_sections')
        .select('id,title,description,layout_type,sort_order,banner_top_url,banner_bottom_url,home_section_items(sort_order,pickle:pickles(id,name,description,image_url,store_id,price_inr,is_veg,pickle_variants(id,label,is_active,variant_packagings(id,selling_price_inr,mrp_inr,discount_pct,is_active,stock))))')
        .eq('is_active', true).order('sort_order'),
    ]);
    setBanners(bannerData || []);
    bannerIndexRef.current = 0;
    setBannerIndex(0);
    setSections((secs || []).map((s: any) => ({
      id: s.id, title: s.title, description: s.description,
      layout_type: s.layout_type || 'card', sort_order: s.sort_order,
      banner_top_url: s.banner_top_url || null,
      banner_bottom_url: s.banner_bottom_url || null,
      items: (s.home_section_items || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((si: any) => si.pickle ? toPickle(si.pickle) : null)
        .filter(Boolean),
    })));
    setLoading(false);
  }, []);

  const loadCart = useCallback(async () => {
    if (!profile || profile.role !== 'customer') return;
    const { data } = await supabase
      .from('cart_items')
      .select('variant_packaging_id,quantity')
      .eq('customer_id', profile.id);
    const map: Record<string, number> = {};
    (data || []).forEach((ci: any) => { map[ci.variant_packaging_id] = ci.quantity; });
    setCartMap(map);
  }, [profile]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { loadCart(); }, [loadCart]));

  useEffect(() => {
    if (banners.length <= 1) return;
    const id = setInterval(() => {
      const next = (bannerIndexRef.current + 1) % banners.length;
      bannerIndexRef.current = next;
      setBannerIndex(next);
      bannerRef.current?.scrollToIndex({ index: next, animated: true });
    }, 3000);
    return () => clearInterval(id);
  }, [banners.length]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadCart()]);
    setRefreshing(false);
  };

  const MAX_QTY = 5;
  const MAX_CART_ITEMS = 5;

  const handleAdd = useCallback((item: Pickle, vpId: string) => {
    if (!profile || profile.role !== 'customer') {
      Alert.alert('Sign in as a customer to add items');
      return;
    }
    if (Object.keys(cartMap).length >= MAX_CART_ITEMS) {
      Alert.alert('Cart full', 'Max 5 different products in cart.');
      return;
    }
    setCartMap(m => ({ ...m, [vpId]: 1 }));
    supabase.from('cart_items').upsert({
      customer_id: profile.id,
      pickle_id: item.id,
      variant_packaging_id: vpId,
      quantity: 1,
    }, { onConflict: 'customer_id,pickle_id,variant_packaging_id' }).then(({ error }) => {
      if (error) {
        Alert.alert('Error', error.message);
        setCartMap(m => { const n = { ...m }; delete n[vpId]; return n; });
      }
    });
  }, [profile, cartMap]);

  const handleDelta = useCallback((vpId: string, currentQty: number, delta: number) => {
    if (!profile) return;
    const newQty = currentQty + delta;
    if (delta > 0 && newQty > MAX_QTY) { Alert.alert('Max 5 per item'); return; }
    setCartMap(m => {
      const n = { ...m };
      if (newQty <= 0) delete n[vpId]; else n[vpId] = newQty;
      return n;
    });
    if (newQty <= 0) {
      supabase.from('cart_items')
        .delete().eq('customer_id', profile.id).eq('variant_packaging_id', vpId)
        .then(({ error }) => {
          if (error) {
            Alert.alert('Error', error.message);
            setCartMap(m => ({ ...m, [vpId]: currentQty }));
          }
        });
    } else {
      supabase.from('cart_items')
        .update({ quantity: newQty }).eq('customer_id', profile.id).eq('variant_packaging_id', vpId)
        .then(({ error }) => {
          if (error) {
            Alert.alert('Error', error.message);
            setCartMap(m => ({ ...m, [vpId]: currentQty }));
          }
        });
    }
  }, [profile]);

  const goToProduct = useCallback((id: string, variantId: string, packagingId: string) => {
    router.push({ pathname: '/product/[id]', params: { id, variantId, packagingId } });
  }, [router]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const cardProps = { cartMap, onAdd: handleAdd, onDelta: handleDelta, onPress: goToProduct };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.hi}>Namaste</Text>
          <Text style={styles.brand}>Venkat Ramana Pickles</Text>
        </View>

        {/* Auto-sliding banner carousel */}
        {banners.length > 0 && (
          <View style={styles.carouselWrap}>
            <FlatList
              ref={bannerRef}
              data={banners}
              keyExtractor={b => b.id}
              horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
              onScrollToIndexFailed={() => {}}
              onMomentumScrollEnd={e => {
                const index = Math.round(e.nativeEvent.contentOffset.x / width);
                bannerIndexRef.current = index;
                setBannerIndex(index);
              }}
              renderItem={({ item }) => (
                <Image source={item.image_url} style={{ width, aspectRatio: 16 / 9 }} contentFit="cover" />
              )}
            />
            {banners.length > 1 && (
              <View style={styles.dots}>
                {banners.map((_, i) => (
                  <View key={i} style={[styles.dot, i === bannerIndex && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Sections */}
        {sections.map(sec => (
          <View key={sec.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            {sec.description ? <Text style={styles.sectionDesc}>{sec.description}</Text> : null}

            {sec.banner_top_url ? (
              <View style={styles.sectionBannerPad}>
                <View style={styles.sectionBanner}>
                  <Image source={sec.banner_top_url} style={StyleSheet.absoluteFill} contentFit="cover" />
                </View>
              </View>
            ) : null}

            {sec.items.length === 0 ? (
              <Text style={styles.emptySection}>Nothing here yet</Text>
            ) : sec.layout_type === 'grid' ? (
              <View style={styles.gridWrap}>
                {sec.items.map(item => (
                  <PickleCard key={item.id} item={item} layout="grid" {...cardProps} />
                ))}
              </View>
            ) : sec.layout_type === 'list' ? (
              <View style={styles.listWrap}>
                {sec.items.map(item => (
                  <PickleCard key={item.id} item={item} layout="list" {...cardProps} />
                ))}
              </View>
            ) : (
              <FlatList
                data={sec.items}
                keyExtractor={i => i.id}
                horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
                renderItem={({ item }) => (
                  <PickleCard item={item} layout="card" {...cardProps} />
                )}
              />
            )}

            {sec.banner_bottom_url ? (
              <View style={[styles.sectionBannerPad, { marginTop: spacing.md, marginBottom: 0 }]}>
                <View style={styles.sectionBanner}>
                  <Image source={sec.banner_bottom_url} style={StyleSheet.absoluteFill} contentFit="cover" />
                </View>
              </View>
            ) : null}
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
  carouselWrap: { position: 'relative', marginBottom: spacing.xl },
  dots: { position: 'absolute', bottom: spacing.sm, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 18 },
  section: { marginBottom: spacing.xl },
  sectionTitle: { paddingHorizontal: spacing.xl, fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.xs },
  sectionDesc: { paddingHorizontal: spacing.xl, fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginBottom: spacing.md },
  sectionBannerPad: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  sectionBanner: { aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceTertiary },
  emptySection: { paddingHorizontal: spacing.xl, color: colors.muted, fontFamily: fonts.text },

  // Card (horizontal scroll)
  card: { width: 160, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardImg: { width: '100%', height: 120, backgroundColor: colors.surfaceTertiary },
  cardInfo: { padding: spacing.sm, paddingBottom: spacing.xs },
  cardName: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface, flex: 1 },

  // Grid
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md, paddingHorizontal: spacing.xl },
  gridCard: { width: '47%', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  gridCardImg: { width: '100%', height: 110, backgroundColor: colors.surfaceTertiary },

  // List
  listWrap: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  listImgWrap: { position: 'relative' },
  listImg: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  listDiscountBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: colors.success, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 2 },
  listDiscountText: { fontFamily: fonts.textBold, fontSize: 9, color: '#fff' },
  listInfo: { flex: 1, paddingTop: 2 },
  listName: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface, flex: 1 },

  // Shared card elements
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2, marginBottom: 2 },
  sellingPrice: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface },
  mrpStrike: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, textDecorationLine: 'line-through' },
  discountBadge: { backgroundColor: colors.success + '22', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  discountText: { fontFamily: fonts.textBold, fontSize: 10, color: colors.success },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  variantChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, width: 56 },
  variantChipText: { fontFamily: fonts.textMedium, fontSize: 11, color: colors.onSurface },

  // Add button
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1.5, borderColor: colors.brandPrimary, borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  addBtnText: { fontFamily: fonts.textBold, fontSize: 12, color: colors.brandPrimary },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.brandPrimary, borderRadius: 6, overflow: 'hidden' },
  stepBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandPrimary + '15' },
  stepQty: { fontFamily: fonts.textBold, fontSize: 12, color: colors.brandPrimary, minWidth: 16, textAlign: 'center' },

  // Veg indicator
  vegBox: { width: 14, height: 14, borderWidth: 1.5, borderRadius: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  vegDot: { width: 7, height: 7, borderRadius: 4 },

  // Variant dropdown (react-native-element-dropdown)
  ddContainer: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', width: 130 },
  ddLabel: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurface },
});
