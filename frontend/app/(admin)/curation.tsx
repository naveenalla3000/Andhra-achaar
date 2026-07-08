import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator,
  Alert, Modal, TextInput, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const LAYOUTS = ['card', 'grid', 'list'];
const NEW_SECTION = { isNew: true };

export default function Curation() {
  const router = useRouter();
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftLayout, setDraftLayout] = useState('card');
  const [draftBannerTop, setDraftBannerTop] = useState('');
  const [draftBannerBottom, setDraftBannerBottom] = useState('');
  const [uploadingTop, setUploadingTop] = useState(false);
  const [uploadingBottom, setUploadingBottom] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: secs } = await supabase
      .from('home_sections')
      .select('id,title,description,layout_type,sort_order,banner_top_url,banner_bottom_url,home_section_items(pickle_id)')
      .order('sort_order');
    setSections(secs || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = (sec: any) => {
    setEditing(sec);
    setDraftTitle(sec.title);
    setDraftDescription(sec.description || '');
    setDraftLayout(sec.layout_type || 'card');
    setDraftBannerTop(sec.banner_top_url || '');
    setDraftBannerBottom(sec.banner_bottom_url || '');
  };

  const openNew = () => {
    setEditing(NEW_SECTION);
    setDraftTitle('');
    setDraftDescription('');
    setDraftLayout('card');
    setDraftBannerTop('');
    setDraftBannerBottom('');
  };

  const pickBanner = async (position: 'top' | 'bottom') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo library access to upload images.'); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled) return;

    const setUploading = position === 'top' ? setUploadingTop : setUploadingBottom;
    const setUrl = position === 'top' ? setDraftBannerTop : setDraftBannerBottom;

    setUploading(true);
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
      setUrl(publicUrl);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  };

  const delSection = async (id: string) => {
    Alert.alert('Delete section?', 'This will remove the section and all its products.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('home_sections').delete().eq('id', id);
          if (error) { Alert.alert('Error', error.message); return; }
          load();
        },
      },
    ]);
  };

  const save = async () => {
    if (!draftTitle.trim()) { Alert.alert('Title required'); return; }
    setSaving(true);

    const payload = {
      title: draftTitle.trim(),
      description: draftDescription.trim() || null,
      layout_type: draftLayout,
      banner_top_url: draftBannerTop.trim() || null,
      banner_bottom_url: draftBannerBottom.trim() || null,
    };

    let sectionId = editing?.isNew ? null : editing.id;
    if (editing?.isNew) {
      const nextOrder = (sections[sections.length - 1]?.sort_order ?? 0) + 1;
      const { data, error } = await supabase.from('home_sections')
        .insert({ ...payload, sort_order: nextOrder })
        .select().single();
      if (error || !data) { setSaving(false); Alert.alert('Error', error?.message || 'Save failed'); return; }
      sectionId = data.id;
    } else {
      const { error } = await supabase.from('home_sections').update(payload).eq('id', sectionId);
      if (error) { setSaving(false); Alert.alert('Error', error.message); return; }
    }

    setSaving(false); setEditing(null); load();
  };

  const onDragEnd = async ({ data }: { data: any[] }) => {
    setSections(data);
    const results = await Promise.all(
      data.map((sec, i) => supabase.from('home_sections').update({ sort_order: i }).eq('id', sec.id))
    );
    const failed = results.find(r => r.error);
    if (failed?.error) Alert.alert('Error saving order', failed.error.message);
  };

  const renderItem = ({ item: sec, drag, isActive }: RenderItemParams<any>) => (
    <ScaleDecorator activeScale={0.97}>
      <Pressable
        testID={`section-${sec.id}`}
        onPress={() => router.push({ pathname: '/section/[id]', params: { id: sec.id, title: sec.title } })}
        onLongPress={drag}
        style={[styles.section, isActive && styles.sectionDragging]}
      >
        {/* Title row */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            <Text style={styles.sectionMeta}>
              {(sec.home_section_items || []).length} product{(sec.home_section_items || []).length === 1 ? '' : 's'} · {sec.layout_type || 'card'}
              {sec.banner_top_url ? ' · top banner' : ''}
              {sec.banner_bottom_url ? ' · bottom banner' : ''}
            </Text>
          </View>
          <Pressable testID={`edit-section-${sec.id}`} onPress={() => openEdit(sec)} hitSlop={8} style={styles.iconBtn}>
            <Feather name="edit-2" size={15} color={colors.muted} />
          </Pressable>
          <Pressable testID={`del-section-${sec.id}`} onPress={() => delSection(sec.id)} hitSlop={8} style={styles.iconBtn}>
            <Feather name="trash-2" size={15} color={colors.error} />
          </Pressable>
        </View>

        {(sec.banner_top_url || sec.banner_bottom_url) ? (
          <View style={styles.thumbRow}>
            {sec.banner_top_url ? (
              <View style={styles.thumbWrap}>
                <Image source={sec.banner_top_url} style={styles.thumb} contentFit="cover" />
                <View style={styles.thumbLabel}><Text style={styles.thumbLabelText}>Top</Text></View>
              </View>
            ) : null}
            {sec.banner_bottom_url ? (
              <View style={styles.thumbWrap}>
                <Image source={sec.banner_bottom_url} style={styles.thumb} contentFit="cover" />
                <View style={styles.thumbLabel}><Text style={styles.thumbLabelText}>Bottom</Text></View>
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </ScaleDecorator>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Homepage Curation</Text>
        <Pressable testID="add-section" onPress={openNew} style={styles.addBtn}>
          <Feather name="plus" size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      {sections.length === 0
        ? <Text style={styles.empty}>No sections yet. Add your first.</Text>
        : (
          <DraggableFlatList
            data={sections}
            keyExtractor={item => item.id}
            onDragEnd={onDragEnd}
            renderItem={renderItem}
            contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxxl }}
          />
        )
      }

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(null)} />
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{editing?.isNew ? 'New Section' : 'Edit Section'}</Text>

              <Text style={styles.modalSub}>Title</Text>
              <TextInput
                testID="section-title"
                style={styles.input}
                placeholder="e.g. Top Sellers"
                placeholderTextColor={colors.muted}
                value={draftTitle}
                onChangeText={setDraftTitle}
              />

              <Text style={styles.modalSub}>Description</Text>
              <TextInput
                testID="section-description"
                style={styles.input}
                placeholder="Optional subtitle"
                placeholderTextColor={colors.muted}
                value={draftDescription}
                onChangeText={setDraftDescription}
                multiline
              />

              <Text style={styles.modalSub}>Layout</Text>
              <View style={styles.segmented}>
                {LAYOUTS.map(l => (
                  <Pressable
                    key={l}
                    testID={`layout-${l}`}
                    onPress={() => setDraftLayout(l)}
                    style={[styles.segment, draftLayout === l && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, draftLayout === l && styles.segmentTextActive]}>
                      {l.charAt(0).toUpperCase() + l.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* ── Banners ── */}
              <Text style={styles.modalSub}>Banners · 16 : 9</Text>

              {(['top', 'bottom'] as const).map(pos => {
                const url = pos === 'top' ? draftBannerTop : draftBannerBottom;
                const uploading = pos === 'top' ? uploadingTop : uploadingBottom;
                const clear = () => (pos === 'top' ? setDraftBannerTop : setDraftBannerBottom)('');
                return (
                  <View key={pos} style={styles.bannerGroup}>
                    <View style={styles.bannerGroupHeader}>
                      <Text style={styles.bannerGroupLabel}>{pos === 'top' ? 'Top' : 'Bottom'} Banner</Text>
                      {url ? (
                        <Pressable onPress={clear} hitSlop={8} style={styles.removeBannerBtn}>
                          <Feather name="x" size={13} color={colors.error} />
                          <Text style={styles.removeBannerText}>Remove</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <Pressable onPress={() => pickBanner(pos)} disabled={uploading} style={styles.bannerBtn}>
                      {uploading ? (
                        <ActivityIndicator color={colors.brandPrimary} />
                      ) : url ? (
                        <View style={StyleSheet.absoluteFill}>
                          <Image source={url} style={StyleSheet.absoluteFill} contentFit="cover" />
                          <View style={styles.bannerOverlay}>
                            <Feather name="edit-2" size={14} color="#fff" />
                            <Text style={styles.bannerOverlayText}>Tap to change</Text>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.bannerEmpty}>
                          <Feather name="image" size={22} color={colors.muted} />
                          <Text style={styles.bannerEmptyText}>Upload {pos} banner</Text>
                          <Text style={styles.bannerEmptyHint}>16 : 9 · will be cropped on pick</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                );
              })}

              <Pressable testID="save-section" onPress={save} disabled={saving} style={styles.saveBtn}>
                {saving
                  ? <ActivityIndicator color={colors.onBrandPrimary} />
                  : <Text style={styles.saveBtnText}>Save</Text>
                }
              </Pressable>
            </ScrollView>
          </View>
        </View>
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
  empty: { fontFamily: fonts.text, color: colors.muted, padding: spacing.xl },

  // section card
  section: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  sectionDragging: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary + '10', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionContent: { flex: 1 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface },
  sectionMeta: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2, textTransform: 'capitalize' },
  iconBtn: { padding: spacing.xs },

  // banner thumbnails in card
  thumbRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  thumbWrap: { flex: 1, borderRadius: radius.sm, overflow: 'hidden', aspectRatio: 16 / 9, position: 'relative' },
  thumb: { width: '100%', height: '100%' },
  thumbLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 2, alignItems: 'center' },
  thumbLabelText: { fontFamily: fonts.textBold, fontSize: 10, color: '#fff', letterSpacing: 0.5 },

  // form sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: '92%' },
  modalTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginBottom: spacing.md },
  modalSub: { fontFamily: fonts.textBold, color: colors.muted, fontSize: 11, letterSpacing: 0.8, marginTop: spacing.xl, marginBottom: spacing.sm, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  segmented: { flexDirection: 'row', gap: spacing.sm },
  segment: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  segmentText: { fontFamily: fonts.textMedium, color: colors.onSurface, fontSize: 13 },
  segmentTextActive: { color: colors.onBrandPrimary },

  // banner upload
  bannerGroup: { marginBottom: spacing.md },
  bannerGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  bannerGroupLabel: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface },
  removeBannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  removeBannerText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.error },
  bannerBtn: { aspectRatio: 16 / 9, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' },
  bannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: spacing.sm },
  bannerOverlayText: { fontFamily: fonts.textMedium, fontSize: 12, color: '#fff' },
  bannerEmpty: { alignItems: 'center', gap: spacing.xs },
  bannerEmptyText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.muted },
  bannerEmptyHint: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, opacity: 0.7 },

  saveBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
  saveBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold },
});
