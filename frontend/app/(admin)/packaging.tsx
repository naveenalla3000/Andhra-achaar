import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  Alert, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const FALLBACK = 'https://images.unsplash.com/photo-1617854307432-13950e24ba07?w=200&q=60';

type PackagingType = { id: string; name: string; image_url: string | null; is_active: boolean; sort_order: number };
type Draft = { name: string; imageUrl: string; uploading: boolean; is_active: boolean };

export default function AdminPackaging() {
  const [items, setItems] = useState<PackagingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PackagingType | null | 'new'>(null);
  const [draft, setDraft] = useState<Draft>({ name: '', imageUrl: '', uploading: false, is_active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('packaging_types').select('id,name,image_url,is_active,sort_order').order('sort_order');
    setItems(data || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setDraft({ name: '', imageUrl: '', uploading: false, is_active: true });
    setEditing('new');
  };

  const openEdit = (item: PackagingType) => {
    setDraft({ name: item.name, imageUrl: item.image_url || '', uploading: false, is_active: item.is_active });
    setEditing(item);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to upload images.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled) return;
    setDraft(d => ({ ...d, uploading: true }));
    try {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/\?.*$/, '');
      const path = `packagings/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('images').upload(path, arrayBuffer, { contentType: asset.mimeType || `image/${ext}`, upsert: false });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(path);
      setDraft(d => ({ ...d, imageUrl: publicUrl, uploading: false }));
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
      setDraft(d => ({ ...d, uploading: false }));
    }
  };

  const save = async () => {
    if (!draft.name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      image_url: draft.imageUrl.trim() || null,
      is_active: draft.is_active,
    };
    if (editing === 'new') {
      const nextOrder = (items[items.length - 1]?.sort_order ?? -1) + 1;
      const { error } = await supabase.from('packaging_types').insert({ ...payload, sort_order: nextOrder });
      if (error) { setSaving(false); Alert.alert('Error', error.message); return; }
    } else if (editing) {
      const { error } = await supabase.from('packaging_types').update(payload).eq('id', editing.id);
      if (error) { setSaving(false); Alert.alert('Error', error.message); return; }
    }
    setSaving(false); setEditing(null); load();
  };

  const onDragEnd = async ({ data }: { data: PackagingType[] }) => {
    setItems(data);
    await Promise.all(data.map((item, idx) =>
      supabase.from('packaging_types').update({ sort_order: idx }).eq('id', item.id)
    ));
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<PackagingType>) => (
    <ScaleDecorator activeScale={0.97}>
      <Pressable onPress={() => openEdit(item)} onLongPress={drag} style={[styles.row, isActive && styles.rowDragging]}>
        <Image source={item.image_url || FALLBACK} style={styles.thumb} contentFit="cover" />
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Switch
          value={item.is_active}
          onValueChange={async (v) => {
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: v } : i));
            await supabase.from('packaging_types').update({ is_active: v }).eq('id', item.id);
          }}
          trackColor={{ true: colors.brandPrimary, false: colors.border }}
          thumbColor={colors.surface}
        />
      </Pressable>
    </ScaleDecorator>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Packaging Types</Text>
        <Pressable onPress={openNew} style={styles.addBtn}>
          <Feather name="plus" size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {loading
        ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
        : items.length === 0
          ? <Text style={styles.empty}>No packaging types yet. Add your first (e.g. Glass Jar, Pouch).</Text>
          : (
            <DraggableFlatList
              data={items}
              keyExtractor={i => i.id}
              onDragEnd={onDragEnd}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
            />
          )
      }

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.backdrop}>
              <View style={styles.sheet}>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <Text style={styles.sheetTitle}>{editing === 'new' ? 'New Packaging Type' : 'Edit Packaging Type'}</Text>

                  <Text style={styles.label}>Image</Text>
                  <Pressable onPress={pickImage} disabled={draft.uploading} style={styles.imageBtn}>
                    {draft.uploading ? (
                      <View style={styles.imageBtnEmpty}><ActivityIndicator color={colors.brandPrimary} /></View>
                    ) : draft.imageUrl ? (
                      <View style={styles.imageBtnPreview}>
                        <Image source={draft.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
                        <View style={styles.imageBtnOverlay}>
                          <Text style={styles.imageBtnChange}>Tap to change</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.imageBtnEmpty}>
                        <Feather name="camera" size={20} color={colors.muted} />
                        <Text style={styles.imageBtnText}>Upload image</Text>
                      </View>
                    )}
                  </Pressable>

                  <Text style={styles.label}>Name</Text>
                  <TextInput style={styles.input} placeholder="e.g. Glass Jar" placeholderTextColor={colors.muted}
                    value={draft.name} onChangeText={v => setDraft(d => ({ ...d, name: v }))} />

                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>Active</Text>
                    <Switch value={draft.is_active} onValueChange={v => setDraft(d => ({ ...d, is_active: v }))}
                      trackColor={{ true: colors.brandPrimary, false: colors.border }} thumbColor={colors.surface} />
                  </View>

                  <View style={styles.actions}>
                    <Pressable onPress={() => setEditing(null)} style={[styles.btn, styles.btnGhost]}>
                      <Text style={styles.btnGhostText}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={save} disabled={saving} style={[styles.btn, { backgroundColor: colors.brandPrimary }]}>
                      {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Save</Text>}
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  list: { padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  rowDragging: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary + '10', elevation: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  rowName: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface, flex: 1 },
  empty: { fontFamily: fonts.text, color: colors.muted, padding: spacing.xl },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: '90%' },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginBottom: spacing.lg },
  label: { fontFamily: fonts.textBold, fontSize: 11, color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  imageBtn: { aspectRatio: 1, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.xs },
  imageBtnEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.surfaceSecondary },
  imageBtnText: { fontFamily: fonts.text, fontSize: 13, color: colors.muted },
  imageBtnPreview: { flex: 1 },
  imageBtnOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', paddingVertical: spacing.xs },
  imageBtnChange: { fontFamily: fonts.text, fontSize: 12, color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  switchLabel: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { fontFamily: fonts.textMedium, color: colors.onSurface },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold },
});
