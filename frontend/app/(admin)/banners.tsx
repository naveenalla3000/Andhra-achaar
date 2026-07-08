import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  Alert, Modal, Switch, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const MAX = 5;

type Banner = { id: string; image_url: string; is_active: boolean; sort_order: number };
type Draft = { imageUrl: string; uploading: boolean; is_active: boolean };

export default function AdminBanners() {
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Banner | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>({ imageUrl: '', uploading: false, is_active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('banners')
      .select('id,image_url,is_active,sort_order')
      .order('sort_order');
    setItems(data || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    if (items.length >= MAX) { Alert.alert('Limit reached', `Max ${MAX} banners allowed.`); return; }
    setDraft({ imageUrl: '', uploading: false, is_active: true });
    setEditing('new');
  };

  const openEdit = (item: Banner) => {
    setDraft({ imageUrl: item.image_url, uploading: false, is_active: item.is_active });
    setEditing(item);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.9,
    });
    if (result.canceled) return;
    setDraft(d => ({ ...d, uploading: true }));
    try {
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/\?.*$/, '');
      const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('images').upload(path, arrayBuffer, {
        contentType: asset.mimeType || `image/${ext}`, upsert: false,
      });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(path);
      setDraft(d => ({ ...d, imageUrl: publicUrl, uploading: false }));
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
      setDraft(d => ({ ...d, uploading: false }));
    }
  };

  const save = async () => {
    if (!draft.imageUrl.trim()) { Alert.alert('Image required'); return; }
    setSaving(true);
    const payload = { image_url: draft.imageUrl.trim(), is_active: draft.is_active };
    if (editing === 'new') {
      const nextOrder = (items[items.length - 1]?.sort_order ?? -1) + 1;
      const { error } = await supabase.from('banners').insert({ ...payload, sort_order: nextOrder });
      if (error) { setSaving(false); Alert.alert('Error', error.message); return; }
    } else if (editing) {
      const { error } = await supabase.from('banners').update(payload).eq('id', editing.id);
      if (error) { setSaving(false); Alert.alert('Error', error.message); return; }
    }
    setSaving(false); setEditing(null); load();
  };

  const del = (id: string) => Alert.alert('Delete banner?', 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('banners').delete().eq('id', id);
        if (error) { Alert.alert('Error', error.message); return; }
        setEditing(null); load();
      },
    },
  ]);

  const onDragEnd = async ({ data }: { data: Banner[] }) => {
    setItems(data);
    await Promise.all(data.map((item, idx) =>
      supabase.from('banners').update({ sort_order: idx }).eq('id', item.id)
    ));
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<Banner>) => (
    <ScaleDecorator activeScale={0.97}>
      <Pressable onPress={() => openEdit(item)} onLongPress={drag}
        style={[styles.row, isActive && styles.rowDragging]}>
        <Image source={item.image_url} style={styles.thumb} contentFit="cover" />
        <Switch
          value={item.is_active}
          onValueChange={async (v) => {
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: v } : i));
            await supabase.from('banners').update({ is_active: v }).eq('id', item.id);
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
        <Text style={styles.header}>Banners</Text>
        {items.length < MAX && (
          <Pressable onPress={openNew} style={styles.addBtn}>
            <Feather name="plus" size={18} color={colors.onBrandPrimary} />
          </Pressable>
        )}
      </View>

      {loading
        ? <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
        : items.length === 0
          ? <Text style={styles.empty}>No banners yet. Add up to {MAX} (16 : 9).</Text>
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>{editing === 'new' ? 'New Banner' : 'Edit Banner'}</Text>

                <Text style={styles.label}>Image · 16 : 9 (enforced on crop)</Text>
                <Pressable onPress={pickImage} disabled={draft.uploading} style={styles.imageBtn}>
                  {draft.uploading ? (
                    <View style={styles.imageBtnInner}>
                      <ActivityIndicator color={colors.brandPrimary} />
                    </View>
                  ) : draft.imageUrl ? (
                    <View style={styles.imageBtnInner}>
                      <Image source={draft.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
                      <View style={styles.imageOverlay}>
                        <Feather name="edit-2" size={14} color="#fff" />
                        <Text style={styles.imageOverlayText}>Tap to change</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.imageBtnInner}>
                      <Feather name="image" size={26} color={colors.muted} />
                      <Text style={styles.imageEmptyText}>Upload banner</Text>
                    </View>
                  )}
                </Pressable>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Active</Text>
                  <Switch value={draft.is_active} onValueChange={v => setDraft(d => ({ ...d, is_active: v }))}
                    trackColor={{ true: colors.brandPrimary, false: colors.border }} thumbColor={colors.surface} />
                </View>

                <View style={styles.actions}>
                  {editing !== 'new' && (
                    <Pressable onPress={() => editing && del(editing.id)}
                      style={[styles.btn, { backgroundColor: colors.error }]}>
                      <Feather name="trash-2" size={16} color="#fff" />
                    </Pressable>
                  )}
                  <Pressable onPress={() => setEditing(null)} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                    <Text style={styles.btnGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={save} disabled={saving}
                    style={[styles.btn, { backgroundColor: colors.brandPrimary, flex: 2 }]}>
                    {saving
                      ? <ActivityIndicator color={colors.onBrandPrimary} />
                      : <Text style={styles.btnText}>Save</Text>}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  list: { padding: spacing.xl, paddingTop: 0, paddingBottom: 120 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  rowDragging: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary + '10', elevation: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  thumb: { flex: 1, aspectRatio: 16 / 9, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  empty: { fontFamily: fonts.text, color: colors.muted, padding: spacing.xl },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: '80%' },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginBottom: spacing.lg },
  label: { fontFamily: fonts.textBold, fontSize: 11, color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.sm },
  imageBtn: { aspectRatio: 16 / 9, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  imageBtnInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.surfaceSecondary },
  imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: spacing.sm },
  imageOverlayText: { fontFamily: fonts.textMedium, fontSize: 12, color: '#fff' },
  imageEmptyText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.muted },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.lg },
  switchLabel: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.onSurface },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.md },
  btn: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { fontFamily: fonts.textMedium, color: colors.onSurface },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold },
});
