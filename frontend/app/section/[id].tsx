import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Modal, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const FALLBACK = 'https://images.unsplash.com/photo-1617854307432-13950e24ba07?w=400&q=80';

export default function SectionItems() {
  const { id, title } = useLocalSearchParams<{ id: string; title: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [allPickles, setAllPickles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sectionItems }, { data: pickles }] = await Promise.all([
      supabase
        .from('home_section_items')
        .select('id,sort_order,pickle:pickles(id,name,image_url,price_inr)')
        .eq('section_id', id)
        .order('sort_order'),
      supabase
        .from('pickles')
        .select('id,name,image_url,price_inr,is_active')
        .order('name'),
    ]);
    setItems(sectionItems || []);
    setAllPickles(pickles || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addPickle = async (pickleId: string) => {
    setAdding(pickleId);
    const nextOrder = items.length;
    const { error } = await supabase.from('home_section_items').insert({
      section_id: id,
      pickle_id: pickleId,
      sort_order: nextOrder,
    });
    setAdding(null);
    if (error) { Alert.alert('Error', error.message); return; }
    await load();
  };

  const removeItem = async (itemId: string) => {
    const { error } = await supabase.from('home_section_items').delete().eq('id', itemId);
    if (error) { Alert.alert('Error', error.message); return; }
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  const onDragEnd = async ({ data }: { data: any[] }) => {
    setItems(data);
    const updates = data.map((item, index) =>
      supabase.from('home_section_items').update({ sort_order: index }).eq('id', item.id)
    );
    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);
    if (failed?.error) Alert.alert('Error saving order', failed.error.message);
  };

  const alreadyAdded = new Set(items.map(i => i.pickle?.id).filter(Boolean));
  const available = allPickles.filter(p => !alreadyAdded.has(p.id));

  const renderItem = ({ item, drag, isActive }: RenderItemParams<any>) => (
    <ScaleDecorator activeScale={0.97}>
      <Pressable
        onLongPress={drag}
        style={[styles.row, isActive && styles.rowDragging]}
      >
        <Image
          source={item.pickle?.image_url || FALLBACK}
          style={styles.thumb}
          contentFit="cover"
        />
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>{item.pickle?.name}</Text>
          {item.pickle?.price_inr > 0 && (
            <Text style={styles.rowPrice}>from ₹{item.pickle.price_inr}</Text>
          )}
        </View>
        <Pressable onPress={() => removeItem(item.id)} hitSlop={12} style={styles.removeBtn}>
          <Feather name="x" size={18} color={colors.error} />
        </Pressable>
      </Pressable>
    </ScaleDecorator>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title || 'Section'}</Text>
        <Pressable onPress={() => setShowAdd(true)} style={styles.addBtn}>
          <Feather name="plus" size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {loading
        ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
        : items.length === 0
          ? (
            <View style={styles.center}>
              <Text style={styles.empty}>No products yet.</Text>
              <Pressable onPress={() => setShowAdd(true)} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Add Products</Text>
              </Pressable>
            </View>
          )
          : (
            <DraggableFlatList
              data={items}
              keyExtractor={item => item.id}
              onDragEnd={onDragEnd}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
            />
          )
      }

      {/* Add products modal */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add Products</Text>
            <Pressable onPress={() => setShowAdd(false)} hitSlop={8}>
              <Feather name="x" size={20} color={colors.onSurface} />
            </Pressable>
          </View>

          {available.length === 0
            ? (
              <Text style={styles.empty}>
                {allPickles.length === 0
                  ? 'No products found. Add products from the seller dashboard first.'
                  : 'All products are already in this section.'}
              </Text>
            )
            : (
              <FlatList
                data={available}
                keyExtractor={p => p.id}
                contentContainerStyle={{ paddingBottom: spacing.xxxl }}
                renderItem={({ item: pickle }) => (
                  <Pressable
                    onPress={() => addPickle(pickle.id)}
                    disabled={adding === pickle.id}
                    style={styles.pickleRow}
                  >
                    <Image
                      source={pickle.image_url || FALLBACK}
                      style={styles.pickleThumb}
                      contentFit="cover"
                    />
                    <View style={styles.pickleInfo}>
                      <Text style={styles.pickleName} numberOfLines={1}>{pickle.name}</Text>
                      {pickle.price_inr > 0 && (
                        <Text style={styles.picklePrice}>from ₹{pickle.price_inr}</Text>
                      )}
                    </View>
                    {adding === pickle.id
                      ? <ActivityIndicator size="small" color={colors.brandPrimary} />
                      : <Feather name="plus-circle" size={20} color={colors.brandPrimary} />
                    }
                  </Pressable>
                )}
              />
            )
          }
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.xl, paddingBottom: spacing.md, gap: spacing.md },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  rowDragging: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary + '10', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  thumb: { width: 52, height: 52, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  rowInfo: { flex: 1 },
  rowName: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface },
  rowPrice: { fontFamily: fonts.text, fontSize: 12, color: colors.brandPrimary, marginTop: 2 },
  removeBtn: { padding: spacing.xs },
  empty: { fontFamily: fonts.text, color: colors.muted, textAlign: 'center' },
  emptyBtn: { marginTop: spacing.sm, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
  emptyBtnText: { fontFamily: fonts.textBold, color: colors.onBrandPrimary },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, top: '15%', backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingTop: spacing.md },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  sheetTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },
  pickleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickleThumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  pickleInfo: { flex: 1 },
  pickleName: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface },
  picklePrice: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
});
