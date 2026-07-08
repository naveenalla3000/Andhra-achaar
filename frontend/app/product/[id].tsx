import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Alert, Dimensions, Modal, Animated, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const FALLBACK = 'https://images.unsplash.com/photo-1617854307432-13950e24ba07?w=800&q=80';
const { width: SCREEN_W } = Dimensions.get('window');

type PackagingOption = {
  id: string;
  packaging_type_name: string;
  packaging_type_image: string | null;
  packaging_cost: number;
  mrp_inr: number;
  selling_price_inr: number;
  discount_pct: number;
  stock: number;
};

type SizeVariant = {
  id: string;
  label: string;
  packagings: PackagingOption[];
};

function packagingIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('jar')) return 'package';
  if (n.includes('bottle')) return 'droplet';
  if (n.includes('pouch') || n.includes('bag')) return 'shopping-bag';
  if (n.includes('box')) return 'box';
  if (n.includes('pack')) return 'archive';
  if (n.includes('tin') || n.includes('can')) return 'disc';
  return 'package';
}

function StockBadge({ stock }: { stock: number }) {
  if (stock === 0) {
    return <View style={[sb.wrap, sb.oos]}><Text style={[sb.text, sb.oosText]}>Out of stock</Text></View>;
  }
  if (stock <= 10) {
    return <View style={[sb.wrap, sb.low]}><Text style={[sb.text, sb.lowText]}>Only {stock} left!</Text></View>;
  }
  return <View style={[sb.wrap, sb.inStock]}><Text style={[sb.text, sb.inText]}>In stock</Text></View>;
}

const sb = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginTop: spacing.sm },
  text: { fontFamily: fonts.textBold, fontSize: 12 },
  oos: { backgroundColor: '#ffeded' },
  oosText: { color: '#c0392b' },
  low: { backgroundColor: '#fff3e0' },
  lowText: { color: '#e65c00' },
  inStock: { backgroundColor: '#e8f5e9' },
  inText: { color: '#2e7d32' },
});

export default function ProductDetail() {
  const { id, variantId, packagingId } = useLocalSearchParams<{ id: string; variantId?: string; packagingId?: string }>();
  const [product, setProduct] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [variants, setVariants] = useState<SizeVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<SizeVariant | null>(null);
  const [selectedPackaging, setSelectedPackaging] = useState<PackagingOption | null>(null);
  const [cartQty, setCartQty] = useState(0);
  const [cartItemId, setCartItemId] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0); // distinct items in cart
  const [loading, setLoading] = useState(true);
  const [cartLoading, setCartLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showQtySheet, setShowQtySheet] = useState(false);
  const [draftQty, setDraftQty] = useState('');
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const { profile } = useAuth();
  const router = useRouter();

  const isCustomer = profile?.role === 'customer';

  const openQtySheet = () => {
    setDraftQty(String(cartQty));
    setShowQtySheet(true);
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();
  };

  const closeQtySheet = () => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setShowQtySheet(false));
  };

  const confirmQty = async () => {
    if (!selectedPackaging || !profile) return;
    const parsed = parseInt(draftQty, 10);
    const maxStock = selectedPackaging.stock;
    if (isNaN(parsed) || parsed < 0) { Alert.alert('Enter a valid quantity'); return; }
    if (parsed > MAX_QTY) { Alert.alert('Max 5 per item'); return; }
    if (cartQty === 0 && parsed > 0 && cartCount >= MAX_CART_ITEMS) { Alert.alert('Cart full', 'Max 5 different products in cart.'); return; }
    if (maxStock > 0 && parsed > maxStock) { Alert.alert(`Only ${maxStock} in stock`); return; }
    setAdding(true);
    if (parsed === 0) {
      if (cartItemId) await supabase.from('cart_items').delete().eq('id', cartItemId);
      setCartQty(0); setCartItemId(null);
    } else {
      const { data, error } = await supabase.from('cart_items').upsert({
        customer_id: profile.id,
        pickle_id: product.id,
        variant_packaging_id: selectedPackaging.id,
        quantity: parsed,
      }, { onConflict: 'customer_id,pickle_id,variant_packaging_id' }).select('id').single();
      if (error) { setAdding(false); Alert.alert('Error', error.message); return; }
      setCartQty(parsed); setCartItemId(data?.id ?? cartItemId);
    }
    setAdding(false);
    closeQtySheet();
  };

  useEffect(() => {
    (async () => {
      const [{ data: prod }, { data: varData }, { data: imgs }] = await Promise.all([
        supabase.from('pickles').select('*,store:stores(id,name)').eq('id', id).maybeSingle(),
        supabase.from('pickle_variants')
          .select('id,label,variant_packagings(id,packaging_cost,mrp_inr,selling_price_inr,discount_pct,stock,is_active,packaging_type:packaging_types(name,image_url))')
          .eq('pickle_id', id).eq('is_active', true).order('label'),
        supabase.from('pickle_images').select('id,image_url,is_primary,sort_order').eq('pickle_id', id).order('sort_order'),
      ]);
      setProduct(prod);

      const vList: SizeVariant[] = (varData || []).map((pv: any) => ({
        id: pv.id,
        label: pv.label,
        packagings: (pv.variant_packagings || [])
          .filter((vp: any) => vp.is_active)
          .map((vp: any) => ({
            id: vp.id,
            packaging_type_name: vp.packaging_type?.name || '',
            packaging_type_image: vp.packaging_type?.image_url || null,
            packaging_cost: vp.packaging_cost ?? 0,
            mrp_inr: vp.mrp_inr,
            selling_price_inr: vp.selling_price_inr,
            discount_pct: vp.discount_pct,
            stock: vp.stock,
          })),
      }));
      setVariants(vList);
      const targetVariant = (variantId ? vList.find(v => v.id === variantId) : null) ?? vList[0] ?? null;
      setSelectedVariant(targetVariant);
      const targetPkg = (packagingId ? targetVariant?.packagings.find(p => p.id === packagingId) : null) ?? targetVariant?.packagings[0] ?? null;
      setSelectedPackaging(targetPkg ?? null);

      const imgList = imgs && imgs.length > 0
        ? imgs
        : prod?.image_url ? [{ id: 'legacy', image_url: prod.image_url, is_primary: true }] : [];
      setImages(imgList);
      const primaryIdx = imgList.findIndex((img: any) => img.is_primary);
      setActiveImageIdx(primaryIdx >= 0 ? primaryIdx : 0);

      setLoading(false);
    })();
  }, [id]);

  const MAX_QTY = 5;
  const MAX_CART_ITEMS = 5;

  // Sync cart qty + total distinct cart items whenever selected packaging changes
  useEffect(() => {
    if (!isCustomer || !profile) {
      // Non-customer: reveal bar immediately in disabled state
      setCartQty(0);
      setCartItemId(null);
      setCartLoading(false);
      return;
    }
    if (!selectedPackaging) {
      // Customer, but product not loaded yet — keep bar hidden
      setCartQty(0);
      setCartItemId(null);
      return;
    }
    setCartLoading(true);
    (async () => {
      const [{ data: item }, { count }] = await Promise.all([
        supabase.from('cart_items').select('id,quantity')
          .eq('customer_id', profile.id).eq('pickle_id', id)
          .eq('variant_packaging_id', selectedPackaging.id).maybeSingle(),
        supabase.from('cart_items').select('*', { count: 'exact', head: true })
          .eq('customer_id', profile.id),
      ]);
      setCartQty(item?.quantity ?? 0);
      setCartItemId(item?.id ?? null);
      setCartCount(count ?? 0);
      setCartLoading(false);
    })();
  }, [selectedPackaging?.id, profile?.id, isCustomer]);

  const increment = async () => {
    if (!isCustomer) { Alert.alert('Sign in as customer to order'); return; }
    if (!selectedPackaging) { Alert.alert('Select a packaging option'); return; }
    if (cartQty >= MAX_QTY) { Alert.alert('Max 5 per item'); return; }
    if (cartQty === 0 && cartCount >= MAX_CART_ITEMS) { Alert.alert('Cart full', 'Max 5 different products in cart.'); return; }
    if (selectedPackaging.stock > 0 && cartQty >= selectedPackaging.stock) {
      Alert.alert('Stock limit reached'); return;
    }
    setAdding(true);
    const newQty = cartQty + 1;
    const { data, error } = await supabase.from('cart_items').upsert({
      customer_id: profile!.id,
      pickle_id: product.id,
      variant_packaging_id: selectedPackaging.id,
      quantity: newQty,
    }, { onConflict: 'customer_id,pickle_id,variant_packaging_id' }).select('id').single();
    if (error) { Alert.alert('Error', error.message); }
    else {
      setCartQty(newQty);
      setCartItemId(data?.id ?? cartItemId);
      if (cartQty === 0) setCartCount(c => c + 1);
    }
    setAdding(false);
  };

  const decrement = async () => {
    if (!selectedPackaging || cartQty === 0) return;
    setAdding(true);
    const newQty = cartQty - 1;
    if (newQty === 0 && cartItemId) {
      const { error } = await supabase.from('cart_items').delete().eq('id', cartItemId);
      if (!error) { setCartQty(0); setCartItemId(null); setCartCount(c => c - 1); }
    } else {
      const { error } = await supabase.from('cart_items').upsert({
        customer_id: profile!.id,
        pickle_id: product.id,
        variant_packaging_id: selectedPackaging.id,
        quantity: newQty,
      }, { onConflict: 'customer_id,pickle_id,variant_packaging_id' });
      if (!error) setCartQty(newQty);
    }
    setAdding(false);
  };

  if (loading || !product) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const hasDiscount = selectedPackaging && selectedPackaging.discount_pct > 0;
  const outOfStock = selectedPackaging ? selectedPackaging.stock === 0 : variants.length > 0;
  const noPackagings = variants.length === 0 || (selectedVariant && selectedVariant.packagings.length === 0);
  const atStockLimit = !!selectedPackaging && (cartQty >= MAX_QTY || (selectedPackaging.stock > 0 && cartQty >= selectedPackaging.stock));

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.heroWrap}>
          <Image source={images[activeImageIdx]?.image_url || FALLBACK} style={styles.hero} contentFit="cover" />
          <LinearGradient colors={['rgba(0,0,0,0.4)', 'transparent']} style={styles.topScrim} />
          <Pressable testID="back-button" onPress={() => router.back()} style={styles.back}>
            <Feather name="chevron-left" size={24} color="#fff" />
          </Pressable>
          {images.length > 1 && (
            <View style={styles.dots}>
              {images.map((_, i) => <View key={i} style={[styles.dot, i === activeImageIdx && styles.dotActive]} />)}
            </View>
          )}
        </View>

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbStrip}>
            {images.map((img, i) => (
              <Pressable key={img.id || i} testID={`thumb-${i}`} onPress={() => setActiveImageIdx(i)}
                style={[styles.thumbWrap, i === activeImageIdx && styles.thumbWrapActive]}>
                <Image source={img.image_url || FALLBACK} style={styles.thumb} contentFit="cover" />
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.body}>
          <Text style={styles.store}>{product.store?.name}</Text>
          <View style={styles.nameRow}>
            <View style={[styles.vegBox, { borderColor: product.is_veg ? '#22a722' : '#d0021b' }]}>
              <View style={[styles.vegDot, { backgroundColor: product.is_veg ? '#22a722' : '#d0021b' }]} />
            </View>
            <Text style={styles.name}>{product.name}</Text>
          </View>

          {/* Step 1: Size */}
          {variants.length > 0 && (
            <>
              <Text style={styles.sec}>Choose Size</Text>
              <View style={styles.variantRow}>
                {variants.map(v => {
                  const hasStock = v.packagings.some(p => p.stock > 0);
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <Pressable
                      key={v.id}
                      testID={`variant-${v.id}`}
                      onPress={() => {
                        setSelectedVariant(v);
                        setSelectedPackaging(v.packagings[0] ?? null);
                      }}
                      style={[styles.chip, isSelected && styles.chipSelected, !hasStock && styles.chipOOS]}
                    >
                      <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected, !hasStock && styles.chipLabelOOS]}>
                        {v.label}{!hasStock ? ' · Out of stock' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Step 2: Packaging */}
          {selectedVariant && selectedVariant.packagings.length > 0 && (
            <>
              <Text style={styles.sec}>Choose Packaging</Text>
              <View style={styles.pkgRow}>
                {selectedVariant.packagings.map(pkg => {
                  const isSelected = selectedPackaging?.id === pkg.id;
                  const oos = pkg.stock === 0;
                  return (
                    <Pressable
                      key={pkg.id}
                      testID={`packaging-${pkg.id}`}
                      onPress={() => !oos && setSelectedPackaging(pkg)}
                      style={[styles.pkgCard, isSelected && styles.pkgCardSel, oos && styles.pkgCardOOS]}
                    >
                      {pkg.packaging_type_image ? (
                        <Image
                          source={pkg.packaging_type_image}
                          style={[styles.pkgCardImg, oos && { opacity: 0.4 }]}
                          contentFit="contain"
                        />
                      ) : (
                        <View style={[styles.pkgIconWrap, isSelected && styles.pkgIconWrapSel, oos && styles.pkgIconWrapOOS]}>
                          <Feather
                            name={packagingIcon(pkg.packaging_type_name) as any}
                            size={22}
                            color={isSelected ? colors.brandPrimary : oos ? colors.muted : colors.onSurface}
                          />
                        </View>
                      )}
                      <Text style={[styles.pkgCardName, isSelected && styles.pkgCardNameSel, oos && styles.pkgCardNameOOS]} numberOfLines={1}>
                        {pkg.packaging_type_name}
                      </Text>
                      <Text style={[styles.pkgCardPrice, isSelected && styles.pkgCardPriceSel, oos && styles.pkgCardNameOOS]}>
                        {oos ? 'Out of stock' : pkg.packaging_cost > 0 ? `+₹${pkg.packaging_cost}` : 'Free'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* Price + Stock */}
          {selectedPackaging && (
            <View style={styles.priceBlock}>
              {hasDiscount ? (
                <View style={styles.priceRow}>
                  <Text style={styles.sellingPrice}>₹{selectedPackaging.selling_price_inr}</Text>
                  <Text style={styles.mrpStrike}>₹{selectedPackaging.mrp_inr}</Text>
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountBadgeText}>{selectedPackaging.discount_pct}% off</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.sellingPrice}>₹{selectedPackaging.selling_price_inr}</Text>
              )}
              <StockBadge stock={selectedPackaging.stock} />
            </View>
          )}

          {product.description && <Text style={styles.desc}>{product.description}</Text>}
          {product.ingredients && (
            <>
              <Text style={styles.sec}>Ingredients</Text>
              {(() => {
                try {
                  const list = JSON.parse(product.ingredients);
                  if (Array.isArray(list) && list.length > 0) {
                    return (
                      <View style={styles.ingredientList}>
                        {list.map((ing: string, i: number) => (
                          <View key={i} style={styles.ingredientItem}>
                            <View style={styles.ingredientDot} />
                            <Text style={styles.desc}>{ing}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  }
                } catch {}
                return <Text style={styles.desc}>{product.ingredients}</Text>;
              })()}
            </>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Fixed bottom bar — hidden until cart state is known */}
      {cartLoading ? null : <View style={styles.bar}>
        {selectedPackaging && !outOfStock && cartQty > 0 && (
          <View style={styles.barPrice}>
            <Text style={styles.barPriceLabel}>Total</Text>
            <Text style={styles.barPriceVal}>
              ₹{((selectedPackaging.selling_price_inr + selectedPackaging.packaging_cost) * cartQty).toFixed(0)}
            </Text>
          </View>
        )}

        {isCustomer && cartQty > 0 ? (
          <View style={styles.stepper}>
            <Pressable
              testID="qty-dec"
              onPress={decrement}
              disabled={adding}
              style={styles.stepperBtn}
            >
              <Feather name={cartQty === 1 ? 'trash-2' : 'minus'} size={17} color={colors.onBrandPrimary} />
            </Pressable>
            {adding
              ? <ActivityIndicator color={colors.onBrandPrimary} size="small" style={styles.stepperLoader} />
              : <Pressable testID="qty-edit" onPress={openQtySheet} style={styles.stepperQtyBtn}>
                  <Text style={styles.stepperQty}>{cartQty}</Text>
                </Pressable>}
            <Pressable
              testID="qty-inc"
              onPress={increment}
              disabled={adding || atStockLimit}
              style={[styles.stepperBtn, atStockLimit && { opacity: 0.4 }]}
            >
              <Feather name="plus" size={17} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            testID="add-to-cart"
            onPress={increment}
            disabled={adding || !!noPackagings || outOfStock}
            style={[styles.cta, (adding || !!noPackagings || outOfStock) && { opacity: 0.5 }]}
          >
            {adding
              ? <ActivityIndicator color={colors.onBrandPrimary} />
              : <Text style={styles.ctaText}>
                  {variants.length === 0 ? 'Not Available'
                    : !selectedVariant ? 'Choose Size'
                    : selectedVariant.packagings.length === 0 ? 'No Packaging Available'
                    : !selectedPackaging ? 'Choose Packaging'
                    : outOfStock ? 'Out of Stock'
                    : 'Add to Cart'}
                </Text>}
          </Pressable>
        )}
      </View>}
      {/* Qty edit sheet */}
      <Modal transparent visible={showQtySheet} animationType="none" onRequestClose={closeQtySheet}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.backdrop} onPress={closeQtySheet} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [280, 0] }) }] }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit Quantity</Text>
              <Pressable onPress={closeQtySheet} style={styles.sheetClose}>
                <Feather name="x" size={20} color={colors.onSurface} />
              </Pressable>
            </View>

            {selectedPackaging && (
              <Text style={styles.sheetHint}>
                {selectedPackaging.stock > 0 ? `Max ${selectedPackaging.stock} in stock · 0 to remove` : 'Enter quantity · 0 to remove'}
              </Text>
            )}

            <View style={styles.sheetQtyRow}>
              <Pressable
                onPress={() => setDraftQty(q => String(Math.max(0, (parseInt(q, 10) || 0) - 1)))}
                style={styles.sheetStepBtn}
              >
                <Feather name="minus" size={20} color={colors.onSurface} />
              </Pressable>
              <TextInput
                style={styles.sheetInput}
                value={draftQty}
                onChangeText={v => setDraftQty(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                selectTextOnFocus
                maxLength={4}
              />
              <Pressable
                onPress={() => {
                  const stockMax = selectedPackaging?.stock ?? 9999;
                  const max = stockMax > 0 ? Math.min(stockMax, MAX_QTY) : MAX_QTY;
                  setDraftQty(q => String(Math.min((parseInt(q, 10) || 0) + 1, max)));
                }}
                style={styles.sheetStepBtn}
              >
                <Feather name="plus" size={20} color={colors.onSurface} />
              </Pressable>
            </View>

            <Pressable
              testID="confirm-qty"
              onPress={confirmQty}
              disabled={adding}
              style={[styles.sheetCta, adding && { opacity: 0.6 }]}
            >
              {adding
                ? <ActivityIndicator color={colors.onBrandPrimary} />
                : <Text style={styles.sheetCtaText}>
                    {parseInt(draftQty, 10) === 0 ? 'Remove from Cart' : 'Update Cart'}
                  </Text>}
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  heroWrap: { height: 300, backgroundColor: colors.surfaceTertiary },
  hero: { width: '100%', height: '100%' },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0, height: 80 },
  back: { position: 'absolute', top: 48, left: spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: spacing.sm, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { backgroundColor: '#fff', width: 18 },
  thumbStrip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  thumbWrap: { borderRadius: radius.sm, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  thumbWrapActive: { borderColor: colors.brandPrimary },
  thumb: { width: 60, height: 60 },
  body: { padding: spacing.xl },
  store: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary, letterSpacing: 1.5, textTransform: 'uppercase' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  vegBox: { width: 18, height: 18, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 9, height: 9, borderRadius: 5 },
  name: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface, flex: 1 },
  sec: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.sm, letterSpacing: 0.5 },
  variantRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  chipSelected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary + '15' },
  chipOOS: { borderColor: colors.border, backgroundColor: colors.surfaceTertiary, opacity: 0.6 },
  chipLabel: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface },
  chipLabelSelected: { color: colors.brandPrimary, fontFamily: fonts.textBold },
  chipLabelOOS: { color: colors.muted, textDecorationLine: 'line-through' },

  // Packaging cards
  pkgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pkgCard: {
    width: (SCREEN_W - spacing.xl * 2 - spacing.sm * 2) / 3,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  pkgCardSel: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary + '10' },
  pkgCardOOS: { opacity: 0.5 },
  pkgCardImg: { width: 44, height: 44, borderRadius: radius.sm },
  pkgIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
  pkgIconWrapSel: { backgroundColor: colors.brandPrimary + '20' },
  pkgIconWrapOOS: { backgroundColor: colors.surfaceTertiary },
  pkgCardName: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurface, textAlign: 'center', marginTop: 2 },
  pkgCardNameSel: { color: colors.brandPrimary, fontFamily: fonts.textBold },
  pkgCardNameOOS: { color: colors.muted },
  pkgCardPrice: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  pkgCardPriceSel: { color: colors.brandPrimary },

  // Price block
  priceBlock: { marginTop: spacing.md },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  sellingPrice: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  mrpStrike: { fontFamily: fonts.text, fontSize: 15, color: colors.muted, textDecorationLine: 'line-through' },
  discountBadge: { backgroundColor: colors.success + '20', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  discountBadgeText: { fontFamily: fonts.textBold, fontSize: 12, color: colors.success },

  desc: { fontFamily: fonts.text, fontSize: 14, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 21 },
  ingredientList: { marginTop: spacing.sm, gap: spacing.xs },
  ingredientItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ingredientDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brandPrimary, marginTop: 1 },

  // Bottom bar
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  barPrice: { flex: 1 },
  barPriceLabel: { fontFamily: fonts.text, fontSize: 11, color: colors.muted },
  barPriceVal: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },
  cta: { flex: 1, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  ctaText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 15 },

  // Inline stepper
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.brandPrimary, borderRadius: radius.md, overflow: 'hidden' },
  stepperBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  stepperQtyBtn: { paddingHorizontal: spacing.sm, height: 48, alignItems: 'center', justifyContent: 'center' },
  stepperQty: { fontFamily: fonts.textBold, fontSize: 17, color: colors.onBrandPrimary, minWidth: 32, textAlign: 'center' },
  stepperLoader: { minWidth: 32 },

  // Qty edit sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 16 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },
  sheetClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  sheetHint: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginBottom: spacing.lg },
  sheetQtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing.xl },
  sheetStepBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  sheetInput: { fontFamily: fonts.display, fontSize: 36, color: colors.onSurface, textAlign: 'center', minWidth: 80, borderBottomWidth: 2, borderBottomColor: colors.brandPrimary, paddingBottom: 4 },
  sheetCta: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  sheetCtaText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 15 },
});
