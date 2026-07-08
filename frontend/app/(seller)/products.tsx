import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Modal, TextInput, Alert, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ScaleDecorator, RenderItemParams, NestableScrollContainer, NestableDraggableFlatList } from 'react-native-draggable-flatlist';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const MAX_IMAGES = 4;
const MAX_VARIANTS = 5;
const MAX_INGREDIENTS = 10;

type Unit = 'g' | 'kg';

type PackagingForm = {
  id?: string;
  packaging_type_id: string;
  packaging_type_name: string;
  packaging_cost: string;
  mrp: string;
  selling: string;
  discount: string;
  stock: string;
};

type VariantForm = {
  id?: string;
  qty: string;
  unit: Unit;
  packagings: PackagingForm[];
  deletedPackagingIds: string[];
};

type ImageForm = {
  id?: string;
  key: string;
  url: string;
  is_primary: boolean;
  uploading?: boolean;
};

type PackagingType = { id: string; name: string; is_active: boolean };
type Category = { id: string; name: string; image_url: string | null };

type ModalState = {
  name: string;
  description: string;
  ingredients: string[];
  is_veg: boolean;
  images: ImageForm[];
  deletedImageIds: string[];
  variants: VariantForm[];
  deletedVariantIds: string[];
  categoryIds: string[];
};

const newImageKey = () => Math.random().toString(36).slice(2);
const blankVariant = (): VariantForm => ({ qty: '', unit: 'g', packagings: [], deletedPackagingIds: [] });
const blankPackaging = (typeId: string, typeName: string): PackagingForm => ({
  packaging_type_id: typeId,
  packaging_type_name: typeName,
  packaging_cost: '0',
  mrp: '',
  selling: '',
  discount: '',
  stock: '0',
});

const variantLabel = (v: VariantForm) => `${v.qty}${v.unit}`;

const parseLabel = (label: string): { qty: string; unit: Unit } => {
  const kg = label.match(/^(\d+(?:\.\d+)?)\s*kg$/i);
  if (kg) return { qty: kg[1], unit: 'kg' };
  const g = label.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (g) return { qty: g[1], unit: 'g' };
  return { qty: label, unit: 'g' };
};

const parseIngredients = (raw: string | null | undefined): string[] => {
  if (!raw) return [''];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  const items = raw.split(',').map(s => s.trim()).filter(Boolean);
  return items.length > 0 ? items : [''];
};

export default function SellerProducts() {
  const { profile } = useAuth();
  const [pickles, setPickles] = useState<any[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [allPackagingTypes, setAllPackagingTypes] = useState<PackagingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.store_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ data: pickleData, error }, { data: catData }, { data: pkgData }] = await Promise.all([
        supabase
          .from('pickles')
          .select('*,pickle_variants(id,label,variant_packagings(selling_price_inr))')
          .eq('store_id', profile.store_id)
          .order('created_at', { ascending: false }),
        supabase.from('categories').select('id,name,image_url').order('sort_order'),
        supabase.from('packaging_types').select('id,name,is_active').eq('is_active', true).order('sort_order'),
      ]);
      if (error) throw error;
      setPickles(pickleData || []);
      setAllCategories(catData || []);
      setAllPackagingTypes(pkgData || []);
    } catch {}
    setLoading(false);
  }, [profile?.store_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAdd = () => {
    setEditingId(null);
    setModal({
      name: '', description: '', ingredients: [''], is_veg: true,
      images: [{ key: newImageKey(), url: '', is_primary: true }],
      deletedImageIds: [],
      variants: [blankVariant()],
      deletedVariantIds: [],
      categoryIds: [],
    });
  };

  const openEdit = async (item: any) => {
    setEditingId(item.id);
    const [{ data: imgs }, { data: cats }, { data: variantData }] = await Promise.all([
      supabase.from('pickle_images').select('id,image_url,sort_order,is_primary').eq('pickle_id', item.id).order('sort_order'),
      supabase.from('pickle_categories').select('category_id').eq('pickle_id', item.id),
      supabase.from('pickle_variants')
        .select('id,label,variant_packagings(id,packaging_type_id,packaging_cost,mrp_inr,selling_price_inr,discount_pct,stock,packaging_type:packaging_types(id,name))')
        .eq('pickle_id', item.id),
    ]);

    let images: ImageForm[] = (imgs || []).map(img => ({ id: img.id, key: img.id, url: img.image_url, is_primary: img.is_primary }));
    if (images.length === 0 && item.image_url)
      images = [{ key: newImageKey(), url: item.image_url, is_primary: true }];
    if (images.length === 0)
      images = [{ key: newImageKey(), url: '', is_primary: true }];

    const pkgs: VariantForm[] = (variantData || []).map((pv: any) => {
      const { qty, unit } = parseLabel(pv.label);
      return {
        id: pv.id, qty, unit,
        packagings: (pv.variant_packagings || []).map((vp: any) => ({
          id: vp.id,
          packaging_type_id: vp.packaging_type_id,
          packaging_type_name: vp.packaging_type?.name || '',
          packaging_cost: String(vp.packaging_cost),
          mrp: String(vp.mrp_inr),
          selling: String(vp.selling_price_inr),
          discount: String(vp.discount_pct),
          stock: String(vp.stock),
        })),
        deletedPackagingIds: [],
      };
    });

    setModal({
      name: item.name, description: item.description || '',
      ingredients: parseIngredients(item.ingredients),
      is_veg: item.is_veg ?? true,
      images, deletedImageIds: [],
      variants: pkgs, deletedVariantIds: [],
      categoryIds: (cats || []).map(c => c.category_id),
    });
  };

  // ── image helpers ──────────────────────────────────────────────────────────
  const addImage = () =>
    setModal(prev => prev && prev.images.length < MAX_IMAGES
      ? { ...prev, images: [...prev.images, { key: newImageKey(), url: '', is_primary: false }] }
      : prev);

  const removeImage = (key: string) =>
    setModal(prev => {
      if (!prev) return null;
      const img = prev.images.find(i => i.key === key);
      if (!img) return prev;
      const deletedImageIds = img.id ? [...prev.deletedImageIds, img.id] : prev.deletedImageIds;
      const images = prev.images.filter(i => i.key !== key);
      if (img.is_primary && images.length > 0) images[0] = { ...images[0], is_primary: true };
      return { ...prev, images, deletedImageIds };
    });

  const setPrimaryImage = (key: string) =>
    setModal(prev => prev
      ? { ...prev, images: prev.images.map(img => ({ ...img, is_primary: img.key === key })) }
      : null);

  const onImageDragEnd = async ({ data }: { data: ImageForm[] }) => {
    setModal(prev => prev ? { ...prev, images: data } : null);
    if (!editingId) return;
    await Promise.all(
      data.filter(img => img.id)
        .map((img, idx) => supabase.from('pickle_images').update({ sort_order: idx }).eq('id', img.id!))
    );
  };

  const pickImage = async (key: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow access to your photo library to upload images.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setModal(prev => prev ? { ...prev, images: prev.images.map(img => img.key === key ? { ...img, uploading: true } : img) } : null);
    try {
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/\?.*$/, '');
      const path = `pickles/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('images').upload(path, arrayBuffer, { contentType: asset.mimeType || `image/${ext}`, upsert: false });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(path);
      setModal(prev => prev ? { ...prev, images: prev.images.map(img => img.key === key ? { ...img, url: publicUrl, uploading: false } : img) } : null);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
      setModal(prev => prev ? { ...prev, images: prev.images.map(img => img.key === key ? { ...img, uploading: false } : img) } : null);
    }
  };

  const toggleCategory = (id: string) =>
    setModal(prev => {
      if (!prev) return null;
      const has = prev.categoryIds.includes(id);
      return { ...prev, categoryIds: has ? prev.categoryIds.filter(c => c !== id) : [...prev.categoryIds, id] };
    });

  // ── ingredient helpers ─────────────────────────────────────────────────────
  const addIngredient = () =>
    setModal(prev => prev && prev.ingredients.length < MAX_INGREDIENTS ? { ...prev, ingredients: [...prev.ingredients, ''] } : prev);

  const removeIngredient = (idx: number) =>
    setModal(prev => prev ? { ...prev, ingredients: prev.ingredients.filter((_, i) => i !== idx) } : null);

  const updateIngredient = (idx: number, val: string) =>
    setModal(prev => {
      if (!prev) return null;
      const ingredients = [...prev.ingredients];
      ingredients[idx] = val;
      return { ...prev, ingredients };
    });

  // ── variant helpers ────────────────────────────────────────────────────────
  const addVariant = () =>
    setModal(prev => prev && prev.variants.length < MAX_VARIANTS
      ? { ...prev, variants: [...prev.variants, blankVariant()] }
      : prev);

  const removeVariant = (idx: number) =>
    setModal(prev => {
      if (!prev) return null;
      const v = prev.variants[idx];
      const deletedVariantIds = v.id ? [...prev.deletedVariantIds, v.id] : prev.deletedVariantIds;
      return { ...prev, variants: prev.variants.filter((_, i) => i !== idx), deletedVariantIds };
    });

  const setVariantQty = (idx: number, val: string) =>
    setModal(prev => {
      if (!prev) return null;
      const variants = [...prev.variants];
      variants[idx] = { ...variants[idx], qty: val.replace(/[^0-9.]/g, '') };
      return { ...prev, variants };
    });

  const setVariantUnit = (idx: number, unit: Unit) =>
    setModal(prev => {
      if (!prev) return null;
      const variants = [...prev.variants];
      variants[idx] = { ...variants[idx], unit };
      return { ...prev, variants };
    });

  // ── packaging helpers ──────────────────────────────────────────────────────
  const addPackaging = (variantIdx: number, typeId: string, typeName: string) =>
    setModal(prev => {
      if (!prev) return null;
      const variants = [...prev.variants];
      const v = { ...variants[variantIdx] };
      v.packagings = [...v.packagings, blankPackaging(typeId, typeName)];
      variants[variantIdx] = v;
      return { ...prev, variants };
    });

  const removePackaging = (variantIdx: number, pkgIdx: number) =>
    setModal(prev => {
      if (!prev) return null;
      const variants = [...prev.variants];
      const v = { ...variants[variantIdx] };
      const pkg = v.packagings[pkgIdx];
      const deletedPackagingIds = pkg.id ? [...v.deletedPackagingIds, pkg.id] : v.deletedPackagingIds;
      v.packagings = v.packagings.filter((_, i) => i !== pkgIdx);
      v.deletedPackagingIds = deletedPackagingIds;
      variants[variantIdx] = v;
      return { ...prev, variants };
    });

  const updatePackaging = (variantIdx: number, pkgIdx: number, field: string, raw: string) =>
    setModal(prev => {
      if (!prev) return null;
      const variants = [...prev.variants];
      const v = { ...variants[variantIdx] };
      const pkgs = [...v.packagings];
      const pkg = { ...pkgs[pkgIdx], [field]: raw };
      const mrp = parseFloat(pkg.mrp);
      const selling = parseFloat(pkg.selling);
      const discount = parseFloat(pkg.discount);
      if (field === 'selling') {
        if (!isNaN(mrp) && mrp > 0 && !isNaN(selling) && selling >= 0)
          pkg.discount = String(Math.round((mrp - selling) / mrp * 1000) / 10);
      } else if (field === 'discount') {
        if (!isNaN(mrp) && mrp > 0 && !isNaN(discount) && discount >= 0)
          pkg.selling = String(Math.round(mrp * (1 - discount / 100) * 100) / 100);
      } else if (field === 'mrp') {
        const newMrp = parseFloat(raw);
        if (!isNaN(newMrp) && newMrp > 0) {
          if (!isNaN(discount) && pkg.discount !== '')
            pkg.selling = String(Math.round(newMrp * (1 - discount / 100) * 100) / 100);
          else if (!isNaN(selling) && pkg.selling !== '')
            pkg.discount = String(Math.round((newMrp - selling) / newMrp * 1000) / 10);
        }
      }
      pkgs[pkgIdx] = pkg;
      v.packagings = pkgs;
      variants[variantIdx] = v;
      return { ...prev, variants };
    });

  const getAvailableTypes = (v: VariantForm) => {
    const used = new Set(v.packagings.map(p => p.packaging_type_id));
    return allPackagingTypes.filter(t => !used.has(t.id));
  };

  // ── save ───────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!modal || !profile?.store_id) return;
    if (!modal.name.trim()) { Alert.alert('Name required'); return; }
    if (modal.variants.length === 0) { Alert.alert('Add at least one size variant'); return; }

    for (const v of modal.variants) {
      if (!v.qty.trim()) { Alert.alert('Quantity required', 'Enter the size for each variant.'); return; }
      if (v.packagings.length === 0) { Alert.alert('Add packaging', `Add at least one packaging option for ${variantLabel(v)}.`); return; }
      for (const pkg of v.packagings) {
        const mrp = parseFloat(pkg.mrp);
        const selling = parseFloat(pkg.selling);
        if (isNaN(mrp) || mrp <= 0) { Alert.alert('MRP required', `Enter MRP for ${variantLabel(v)} · ${pkg.packaging_type_name}.`); return; }
        if (isNaN(selling) || selling < 0) { Alert.alert('Selling price required', `Enter selling price for ${variantLabel(v)} · ${pkg.packaging_type_name}.`); return; }
        if (selling > mrp) { Alert.alert('Invalid price', `Selling cannot exceed MRP for ${variantLabel(v)} · ${pkg.packaging_type_name}.`); return; }
      }
    }

    setSaving(true);

    const validImages = modal.images.filter(img => img.url.trim());
    const hasPrimary = validImages.some(img => img.is_primary);
    const finalImages = validImages.map((img, idx) => ({ ...img, sort_order: idx, is_primary: hasPrimary ? img.is_primary : idx === 0 }));
    const primaryUrl = finalImages.find(img => img.is_primary)?.url.trim() || null;

    const allPackagings = modal.variants.flatMap(v => v.packagings);
    const minSelling = allPackagings.length > 0
      ? Math.min(...allPackagings.map(p => parseFloat(p.selling) || 0))
      : 0;

    const picklePayload = {
      name: modal.name.trim(),
      description: modal.description.trim() || null,
      image_url: primaryUrl,
      ingredients: (() => { const l = modal.ingredients.map(s => s.trim()).filter(Boolean); return l.length ? JSON.stringify(l) : null; })(),
      is_veg: modal.is_veg,
      price_inr: minSelling,
    };

    let pickleId = editingId;
    if (editingId) {
      const { error } = await supabase.from('pickles').update(picklePayload).eq('id', editingId);
      if (error) { setSaving(false); Alert.alert('Error', error.message); return; }
    } else {
      const { data, error } = await supabase.from('pickles').insert({ ...picklePayload, store_id: profile.store_id }).select('id').single();
      if (error) { setSaving(false); Alert.alert('Error', error.message); return; }
      pickleId = data.id;
    }

    // Images
    for (const id of modal.deletedImageIds)
      await supabase.from('pickle_images').delete().eq('id', id);
    for (const img of finalImages) {
      if (img.id) {
        await supabase.from('pickle_images').update({ image_url: img.url.trim(), sort_order: img.sort_order, is_primary: img.is_primary }).eq('id', img.id);
      } else {
        await supabase.from('pickle_images').insert({ pickle_id: pickleId, image_url: img.url.trim(), sort_order: img.sort_order, is_primary: img.is_primary });
      }
    }

    // Categories
    await supabase.from('pickle_categories').delete().eq('pickle_id', pickleId);
    if (modal.categoryIds.length > 0)
      await supabase.from('pickle_categories').insert(modal.categoryIds.map(category_id => ({ pickle_id: pickleId, category_id })));

    // Variants + packagings
    for (const v of modal.variants) {
      let variantId = v.id;
      const label = variantLabel(v);

      if (variantId) {
        await supabase.from('pickle_variants').update({ label }).eq('id', variantId);
      } else {
        const { data: newV, error } = await supabase.from('pickle_variants')
          .insert({ pickle_id: pickleId, label, mrp_inr: 0, selling_price_inr: 0, discount_pct: 0, stock: 0 })
          .select('id').single();
        if (error) { setSaving(false); Alert.alert('Error', error.message); return; }
        variantId = newV.id;
      }

      for (const pkgId of v.deletedPackagingIds)
        await supabase.from('variant_packagings').delete().eq('id', pkgId);

      for (const pkg of v.packagings) {
        const mrp = parseFloat(pkg.mrp);
        const selling = parseFloat(pkg.selling);
        const discount = isNaN(mrp) || mrp <= 0 ? 0 : Math.round((mrp - selling) / mrp * 1000) / 10;
        const pkgPayload = {
          packaging_type_id: pkg.packaging_type_id,
          packaging_cost: parseFloat(pkg.packaging_cost) || 0,
          mrp_inr: mrp,
          selling_price_inr: selling,
          discount_pct: discount,
          stock: Math.max(0, parseInt(pkg.stock) || 0),
        };
        if (pkg.id) {
          await supabase.from('variant_packagings').update(pkgPayload).eq('id', pkg.id);
        } else {
          await supabase.from('variant_packagings').insert({ ...pkgPayload, variant_id: variantId });
        }
      }
    }

    for (const id of modal.deletedVariantIds)
      await supabase.from('pickle_variants').delete().eq('id', id);

    setSaving(false); setModal(null); load();
  };

  const toggle = async (id: string, next: boolean) => {
    await supabase.from('pickles').update({ is_active: next }).eq('id', id); load();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const canAdd = profile?.role === 'primary_seller' || profile?.role === 'admin';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Pickles</Text>
        {canAdd && (
          <Pressable testID="add-pickle-btn" onPress={openAdd} style={styles.addBtn}>
            <Feather name="plus" size={18} color={colors.onBrandPrimary} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={pickles}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl }}
        ListEmptyComponent={<Text style={styles.empty}>No pickles yet. Add your first one.</Text>}
        renderItem={({ item }) => {
          const variants: any[] = item.pickle_variants || [];
          return (
            <View style={styles.card}>
              <Image
                source={item.image_url || 'https://images.unsplash.com/photo-1617854307432-13950e24ba07?w=200&q=60'}
                style={styles.cardImage} contentFit="cover"
              />
              <View style={styles.cardBody}>
                <View style={styles.rowBetween}>
                  <View style={styles.nameRow}>
                    <View style={[styles.vegDotCard, { borderColor: item.is_veg ? '#22a722' : '#d0021b' }]}>
                      <View style={[styles.vegDotInner, { backgroundColor: item.is_veg ? '#22a722' : '#d0021b' }]} />
                    </View>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <View style={styles.cardActions}>
                    {canAdd && (
                      <Pressable testID={`edit-${item.id}`} onPress={() => openEdit(item)} hitSlop={8} style={styles.editBtn}>
                        <Feather name="edit-2" size={14} color={colors.muted} />
                      </Pressable>
                    )}
                    <Pressable testID={`toggle-${item.id}`} onPress={() => toggle(item.id, !item.is_active)}>
                      <Text style={[styles.status, { color: item.is_active ? colors.success : colors.muted }]}>
                        {item.is_active ? 'ACTIVE' : 'HIDDEN'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
                {variants.length > 0 ? (
                  <View style={styles.variantTagsRow}>
                    {variants.map((v: any) => {
                      const pkgs: any[] = v.variant_packagings || [];
                      const minPrice = pkgs.length > 0 ? Math.min(...pkgs.map((p: any) => Number(p.selling_price_inr))) : null;
                      return (
                        <View key={v.id} style={styles.variantTag}>
                          <Text style={styles.variantTagText}>{v.label}{minPrice != null ? ` · ₹${minPrice}` : ''}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.noVariants}>No variants — add pricing</Text>
                )}
              </View>
            </View>
          );
        }}
      />

      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.backdrop}>
            <View style={styles.modal}>
              <NestableScrollContainer keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>{editingId ? 'Edit Pickle' : 'Add Pickle'}</Text>

                {/* Name */}
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput testID="new-pickle-name" style={styles.input} placeholder="e.g. Mango Avakaya" placeholderTextColor={colors.muted}
                  value={modal?.name || ''} onChangeText={v => setModal(p => p ? { ...p, name: v } : null)} />

                {/* Description */}
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput style={styles.input} placeholder="Short description (optional)" placeholderTextColor={colors.muted}
                  value={modal?.description || ''} onChangeText={v => setModal(p => p ? { ...p, description: v } : null)} multiline />

                {/* Images */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.fieldLabel}>Images (max {MAX_IMAGES})</Text>
                  {(modal?.images.length || 0) < MAX_IMAGES && (
                    <Pressable onPress={addImage} style={styles.addSmallBtn}>
                      <Feather name="plus" size={13} color={colors.brandPrimary} />
                      <Text style={styles.addSmallText}>Add</Text>
                    </Pressable>
                  )}
                </View>
                <NestableDraggableFlatList
                  data={modal?.images || []}
                  keyExtractor={item => item.key}
                  onDragEnd={onImageDragEnd}
                  renderItem={({ item: img, drag, isActive }: RenderItemParams<ImageForm>) => (
                    <ScaleDecorator activeScale={0.97}>
                      <View style={[styles.imageCard, isActive && styles.imageCardDragging]}>
                        <Pressable onPress={() => pickImage(img.key)} onLongPress={drag} disabled={img.uploading} style={styles.imagePickArea}>
                          {img.url ? (
                            <Image source={img.url} style={styles.imagePickAreaFilled} contentFit="cover" />
                          ) : (
                            <View style={styles.imagePlaceholder}>
                              <Feather name="camera" size={22} color={colors.muted} />
                              <Text style={styles.imagePlaceholderText}>Tap to upload · Hold to reorder</Text>
                            </View>
                          )}
                          {img.uploading && <View style={styles.imageUploadingOverlay}><ActivityIndicator color="#fff" /></View>}
                        </Pressable>
                        <View style={styles.imageActions}>
                          <Pressable onPress={() => setPrimaryImage(img.key)} hitSlop={8} style={styles.imgActionBtn}>
                            <Feather name="star" size={16} color={img.is_primary ? '#f59e0b' : colors.border} />
                          </Pressable>
                          <View style={{ flex: 1 }} />
                          <Pressable onPress={() => removeImage(img.key)} hitSlop={8} style={styles.imgActionBtn}>
                            <Feather name="x" size={16} color={colors.error} />
                          </Pressable>
                        </View>
                      </View>
                    </ScaleDecorator>
                  )}
                />

                {/* Ingredients */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.fieldLabel}>Ingredients</Text>
                  {(modal?.ingredients.length || 0) < MAX_INGREDIENTS && (
                    <Pressable onPress={addIngredient} style={styles.addSmallBtn}>
                      <Feather name="plus" size={13} color={colors.brandPrimary} />
                      <Text style={styles.addSmallText}>Add</Text>
                    </Pressable>
                  )}
                </View>
                {(modal?.ingredients || []).map((ing, idx) => (
                  <View key={idx} style={styles.ingredientRow}>
                    <TextInput style={[styles.input, styles.ingredientInput]} placeholder="e.g. Salt"
                      placeholderTextColor={colors.muted} value={ing} onChangeText={val => updateIngredient(idx, val)} returnKeyType="next" />
                    {(modal?.ingredients.length || 0) > 1 && (
                      <Pressable onPress={() => removeIngredient(idx)} hitSlop={8} style={styles.removeIngredientBtn}>
                        <Feather name="x" size={16} color={colors.error} />
                      </Pressable>
                    )}
                  </View>
                ))}

                {/* Categories */}
                {allCategories.length > 0 && (
                  <>
                    <Text style={styles.fieldLabel}>Categories</Text>
                    <View style={styles.categoryWrap}>
                      {allCategories.map(cat => {
                        const selected = modal?.categoryIds.includes(cat.id);
                        return (
                          <Pressable key={cat.id} onPress={() => toggleCategory(cat.id)}
                            style={[styles.categoryChip, selected && styles.categoryChipSelected]}>
                            {cat.image_url ? <Image source={cat.image_url} style={styles.categoryChipImg} contentFit="cover" /> : null}
                            <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>{cat.name}</Text>
                            {selected && <Feather name="check" size={12} color={colors.onBrandPrimary} />}
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* Type */}
                <Text style={styles.fieldLabel}>Type</Text>
                <View style={styles.vegToggleRow}>
                  {([true, false] as const).map(isVeg => (
                    <Pressable key={String(isVeg)} onPress={() => setModal(p => p ? { ...p, is_veg: isVeg } : null)}
                      style={[styles.vegBtn, modal?.is_veg === isVeg && (isVeg ? styles.vegBtnActiveVeg : styles.vegBtnActiveNonVeg)]}>
                      <View style={[styles.vegDot, { backgroundColor: isVeg ? '#22a722' : '#d0021b' }]} />
                      <Text style={[styles.vegBtnText, modal?.is_veg === isVeg && styles.vegBtnTextActive]}>{isVeg ? 'Veg' : 'Non-Veg'}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Variants */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.fieldLabel}>Size Variants (max {MAX_VARIANTS})</Text>
                  {(modal?.variants.length || 0) < MAX_VARIANTS && (
                    <Pressable onPress={addVariant} style={styles.addSmallBtn}>
                      <Feather name="plus" size={13} color={colors.brandPrimary} />
                      <Text style={styles.addSmallText}>Add Size</Text>
                    </Pressable>
                  )}
                </View>

                {(modal?.variants || []).map((v, idx) => {
                  const available = getAvailableTypes(v);
                  return (
                    <View key={idx} style={styles.variantCard}>
                      {/* Size row */}
                      <View style={styles.qtyUnitRow}>
                        <TextInput style={[styles.input, styles.qtyInput]} placeholder="250" placeholderTextColor={colors.muted}
                          value={v.qty} keyboardType="numeric" onChangeText={val => setVariantQty(idx, val)} />
                        <View style={styles.unitToggle}>
                          {(['g', 'kg'] as Unit[]).map(u => (
                            <Pressable key={u} onPress={() => setVariantUnit(idx, u)} style={[styles.unitBtn, v.unit === u && styles.unitBtnActive]}>
                              <Text style={[styles.unitBtnText, v.unit === u && styles.unitBtnTextActive]}>{u}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <Pressable onPress={() => removeVariant(idx)} hitSlop={8} style={styles.removeVariantBtn}>
                          <Feather name="trash-2" size={15} color={colors.error} />
                        </Pressable>
                      </View>

                      {/* Packaging sub-section */}
                      <View style={styles.pkgSection}>
                        <View style={styles.pkgSectionHeader}>
                          <Text style={styles.pkgSectionTitle}>PACKAGINGS</Text>
                        </View>

                        {v.packagings.length === 0 && (
                          <Text style={styles.pkgEmpty}>No packagings yet — add one below</Text>
                        )}

                        {v.packagings.map((pkg, pkgIdx) => (
                          <View key={pkgIdx} style={styles.pkgCard}>
                            <View style={styles.pkgCardHeader}>
                              <View style={styles.pkgTypeBadge}>
                                <Feather name="box" size={11} color={colors.brandPrimary} />
                                <Text style={styles.pkgTypeName}>{pkg.packaging_type_name}</Text>
                              </View>
                              <Pressable onPress={() => removePackaging(idx, pkgIdx)} hitSlop={8}>
                                <Feather name="x" size={15} color={colors.error} />
                              </Pressable>
                            </View>

                            {/* Cost */}
                            <Text style={styles.priceFieldLabel}>Packaging Cost (₹) — internal only</Text>
                            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.muted}
                              value={pkg.packaging_cost} keyboardType="numeric"
                              onChangeText={val => updatePackaging(idx, pkgIdx, 'packaging_cost', val.replace(/[^0-9.]/g, ''))} />

                            {/* MRP / Selling / Discount */}
                            <View style={styles.priceRow}>
                              <View style={styles.priceField}>
                                <Text style={styles.priceFieldLabel}>MRP (₹)</Text>
                                <TextInput style={styles.input} placeholder="500" placeholderTextColor={colors.muted}
                                  value={pkg.mrp} keyboardType="numeric"
                                  onChangeText={val => updatePackaging(idx, pkgIdx, 'mrp', val.replace(/[^0-9.]/g, ''))} />
                              </View>
                              <View style={styles.priceField}>
                                <Text style={styles.priceFieldLabel}>Selling (₹)</Text>
                                <TextInput style={styles.input} placeholder="400" placeholderTextColor={colors.muted}
                                  value={pkg.selling} keyboardType="numeric"
                                  onChangeText={val => updatePackaging(idx, pkgIdx, 'selling', val.replace(/[^0-9.]/g, ''))} />
                              </View>
                              <View style={styles.priceField}>
                                <Text style={styles.priceFieldLabel}>Disc %</Text>
                                <TextInput style={styles.input} placeholder="20" placeholderTextColor={colors.muted}
                                  value={pkg.discount} keyboardType="numeric"
                                  onChangeText={val => updatePackaging(idx, pkgIdx, 'discount', val.replace(/[^0-9.]/g, ''))} />
                              </View>
                            </View>

                            {/* Stock */}
                            <View style={styles.stockRow}>
                              <Feather name="package" size={13} color={colors.muted} />
                              <Text style={styles.priceFieldLabel}>Stock</Text>
                              <TextInput style={[styles.input, styles.stockInput]} placeholder="0" placeholderTextColor={colors.muted}
                                value={pkg.stock} keyboardType="numeric"
                                onChangeText={val => updatePackaging(idx, pkgIdx, 'stock', val.replace(/[^0-9]/g, ''))} />
                              <Text style={styles.stockUnit}>units</Text>
                            </View>
                          </View>
                        ))}

                        {/* Add packaging chips */}
                        {available.length > 0 && (
                          <View style={styles.addPkgRow}>
                            <Text style={styles.addPkgLabel}>Add:</Text>
                            {available.map(type => (
                              <Pressable key={type.id} onPress={() => addPackaging(idx, type.id, type.name)} style={styles.addPkgChip}>
                                <Feather name="plus" size={11} color={colors.brandPrimary} />
                                <Text style={styles.addPkgChipText}>{type.name}</Text>
                              </Pressable>
                            ))}
                          </View>
                        )}
                        {allPackagingTypes.length === 0 && (
                          <Text style={styles.pkgEmpty}>No packaging types defined. Ask admin to add some first.</Text>
                        )}
                      </View>
                    </View>
                  );
                })}

                <View style={styles.modalActions}>
                  <Pressable testID="cancel-modal" onPress={() => setModal(null)} style={[styles.mBtn, styles.mBtnGhost]}>
                    <Text style={styles.mBtnGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable testID="save-pickle" onPress={save} disabled={saving} style={[styles.mBtn, { backgroundColor: colors.brandPrimary }]}>
                    {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.mBtnText}>Save</Text>}
                  </Pressable>
                </View>
              </NestableScrollContainer>
            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, paddingBottom: spacing.md },
  header: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl, fontFamily: fonts.text },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, flexDirection: 'row', overflow: 'hidden' },
  cardImage: { width: 90, height: 90 },
  cardBody: { flex: 1, padding: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  vegDotCard: { width: 14, height: 14, borderWidth: 1.5, borderRadius: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  vegDotInner: { width: 7, height: 7, borderRadius: 4 },
  name: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface, flex: 1 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editBtn: { padding: 4 },
  status: { fontFamily: fonts.textBold, fontSize: 10, letterSpacing: 1 },
  variantTagsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  variantTag: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  variantTagText: { fontFamily: fonts.text, fontSize: 11, color: colors.onSurface },
  noVariants: { fontFamily: fonts.text, fontSize: 12, color: colors.error, marginTop: spacing.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: '94%' },
  modalTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginBottom: spacing.md },
  fieldLabel: { fontFamily: fonts.textBold, fontSize: 11, color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.xs, marginTop: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  addSmallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: spacing.sm },
  addSmallText: { fontFamily: fonts.textBold, fontSize: 13, color: colors.brandPrimary },
  imageCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.surfaceSecondary, overflow: 'hidden' },
  imageCardDragging: { borderColor: colors.brandPrimary, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  imagePickArea: { height: 140, width: '100%' },
  imagePickAreaFilled: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.surfaceTertiary },
  imagePlaceholderText: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  imageUploadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  imageActions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  imgActionBtn: { padding: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  variantCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surfaceSecondary },
  qtyUnitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  qtyInput: { flex: 1, marginBottom: 0 },
  unitToggle: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  unitBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  unitBtnActive: { backgroundColor: colors.brandPrimary },
  unitBtnText: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface },
  unitBtnTextActive: { color: colors.onBrandPrimary, fontFamily: fonts.textBold },
  removeVariantBtn: { padding: 4 },
  pkgSection: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  pkgSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  pkgSectionTitle: { fontFamily: fonts.textBold, fontSize: 10, color: colors.muted, letterSpacing: 1 },
  pkgEmpty: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginBottom: spacing.sm },
  pkgCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  pkgCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  pkgTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandPrimary + '15', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  pkgTypeName: { fontFamily: fonts.textBold, fontSize: 12, color: colors.brandPrimary },
  priceRow: { flexDirection: 'row', gap: spacing.sm },
  priceField: { flex: 1 },
  priceFieldLabel: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, marginBottom: 2 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  stockInput: { width: 80, marginBottom: 0 },
  stockUnit: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  addPkgRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  addPkgLabel: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  addPkgChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary + '10' },
  addPkgChipText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md },
  mBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  mBtnGhost: { borderWidth: 1, borderColor: colors.border },
  mBtnGhostText: { fontFamily: fonts.textMedium, color: colors.onSurface },
  mBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  categoryChipSelected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary },
  categoryChipImg: { width: 18, height: 18, borderRadius: 9 },
  categoryChipText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  categoryChipTextSelected: { color: colors.onBrandPrimary },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  ingredientInput: { flex: 1, marginBottom: 0 },
  removeIngredientBtn: { padding: 4 },
  vegToggleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  vegBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  vegBtnActiveVeg: { borderColor: '#22a722', backgroundColor: '#22a72215' },
  vegBtnActiveNonVeg: { borderColor: '#d0021b', backgroundColor: '#d0021b15' },
  vegBtnText: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.muted },
  vegBtnTextActive: { color: colors.onSurface, fontFamily: fonts.textBold },
  vegDot: { width: 10, height: 10, borderRadius: 5 },
});
