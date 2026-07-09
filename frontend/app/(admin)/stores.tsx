import { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator,
  Modal, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';
import TimePickerWheel from '@/src/components/TimePickerWheel';
import StoreMapPicker from '@/src/components/StoreMapPicker';

type Draft = {
  id?: string;
  name: string;
  address: string;
  opens_at: string;
  closes_at: string;
  latitude: string;
  longitude: string;
  image_url: string;
  contact_number: string;
};

const blankDraft = (): Draft => ({
  name: '', address: '', opens_at: '09:00', closes_at: '21:00',
  latitude: '', longitude: '', image_url: '', contact_number: '',
});

const formatTimeDisplay = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
};

export default function AdminStores() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);

  const [timePickerFor, setTimePickerFor] = useState<'opens_at' | 'closes_at' | null>(null);
  const timePickerOriginal = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('stores')
      .select('*,primary_seller:user_profiles!stores_primary_seller_id_fkey(id,full_name)')
      .order('name');
    setStores(data || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setLocalImageUri(null);
    setModal(blankDraft());
  };

  const openEdit = (item: any) => {
    setLocalImageUri(null);
    setModal({
      id: item.id,
      name: item.name || '',
      address: item.address || '',
      opens_at: item.opens_at || '09:00',
      closes_at: item.closes_at || '21:00',
      latitude: item.latitude != null ? String(item.latitude) : '',
      longitude: item.longitude != null ? String(item.longitude) : '',
      image_url: item.image_url || '',
      contact_number: item.contact_number || '',
    });
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setLocalImageUri(result.assets[0].uri);
    }
  };

  const save = async () => {
    if (!modal) return;
    if (!modal.name.trim() || !modal.address.trim()) { Alert.alert('Name and address required'); return; }
    setSaving(true);

    let imageUrl = modal.image_url || null;

    if (localImageUri) {
      const ext = localImageUri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const fileName = `store-${Date.now()}.${ext}`;
      const response = await fetch(localImageUri);
      const blob = await response.blob();
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('store-images')
        .upload(fileName, blob, { contentType: mimeType, upsert: false });
      if (uploadError) {
        setSaving(false);
        Alert.alert('Upload failed', uploadError.message);
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('store-images').getPublicUrl(uploadData.path);
      imageUrl = publicUrl;
    }

    const payload = {
      name: modal.name.trim(),
      address: modal.address.trim(),
      opens_at: modal.opens_at.trim() || '09:00',
      closes_at: modal.closes_at.trim() || '21:00',
      latitude: modal.latitude.trim() || null,
      longitude: modal.longitude.trim() || null,
      image_url: imageUrl,
      contact_number: modal.contact_number.trim() || null,
    };
    const { error } = modal.id
      ? await supabase.from('stores').update(payload).eq('id', modal.id)
      : await supabase.from('stores').insert(payload);
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setLocalImageUri(null);
    setModal(null);
    load();
  };

  const openTimePicker = (field: 'opens_at' | 'closes_at') => {
    timePickerOriginal.current = modal?.[field] || '';
    setTimePickerFor(field);
  };

  const cancelTimePicker = () => {
    if (timePickerFor && timePickerOriginal.current)
      setModal(m => m ? { ...m, [timePickerFor]: timePickerOriginal.current } : null);
    setTimePickerFor(null);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Stores</Text>
        <Pressable testID="add-store-btn" onPress={openNew} style={styles.addBtn}>
          <Feather name="plus" size={18} color={colors.onBrandPrimary} />
        </Pressable>
      </View>

      <FlatList
        data={stores}
        keyExtractor={s => s.id}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl }}
        ListEmptyComponent={<Text style={styles.empty}>No stores yet. Add your first.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {item.image_url ? (
                <Image source={item.image_url} style={styles.cardThumb} contentFit="cover" />
              ) : (
                <View style={styles.cardThumbPlaceholder}>
                  <Feather name="home" size={18} color={colors.brandPrimary} />
                </View>
              )}
              <View style={styles.cardBody}>
                <View style={styles.cardNameRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Pressable onPress={() => openEdit(item)} hitSlop={8} style={styles.editBtn}>
                    <Feather name="edit-2" size={15} color={colors.muted} />
                  </Pressable>
                </View>
                <Text style={styles.line}>{item.address}</Text>
                <Text style={styles.line}>{item.opens_at} – {item.closes_at}</Text>
                {item.contact_number ? (
                  <View style={styles.coordRow}>
                    <Feather name="phone" size={11} color={colors.brandPrimary} />
                    <Text style={styles.coordText}>{item.contact_number}</Text>
                  </View>
                ) : null}
                {(item.latitude || item.longitude) && (
                  <View style={styles.coordRow}>
                    <Feather name="map-pin" size={11} color={colors.brandPrimary} />
                    <Text style={styles.coordText}>{item.latitude}, {item.longitude}</Text>
                  </View>
                )}
                <Text style={styles.meta}>Primary seller: {item.primary_seller?.full_name || 'unassigned'}</Text>
              </View>
            </View>
          </View>
        )}
      />

      {/* ── Store form modal ── */}
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>{modal?.id ? 'Edit Store' : 'New Store'}</Text>

                {/* ── Image ── */}
                <Text style={styles.label}>Store Photo</Text>
                <View style={styles.imageRow}>
                  <Pressable onPress={pickImage} style={styles.imageBox}>
                    {(localImageUri || modal?.image_url) ? (
                      <Image
                        source={localImageUri || modal?.image_url}
                        style={styles.imagePreview}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Feather name="camera" size={28} color={colors.muted} />
                        <Text style={styles.imagePlaceholderText}>Tap to add</Text>
                      </View>
                    )}
                  </Pressable>
                  <View style={styles.imageActions}>
                    <Pressable onPress={pickImage} style={styles.imageBtn}>
                      <Feather name="image" size={14} color={colors.brandPrimary} />
                      <Text style={styles.imageBtnText}>
                        {(localImageUri || modal?.image_url) ? 'Change Photo' : 'Add Photo'}
                      </Text>
                    </Pressable>
                    {(localImageUri || modal?.image_url) ? (
                      <Pressable
                        onPress={() => {
                          setLocalImageUri(null);
                          setModal(m => m ? { ...m, image_url: '' } : null);
                        }}
                        style={styles.imageRemoveBtn}
                      >
                        <Text style={styles.imageRemoveText}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <Text style={styles.label}>Store name</Text>
                <TextInput
                  testID="store-name"
                  style={styles.input}
                  placeholder="e.g. Venkat Ramana Pickles"
                  placeholderTextColor={colors.muted}
                  value={modal?.name}
                  onChangeText={v => setModal(m => m ? { ...m, name: v } : null)}
                />

                <Text style={styles.label}>Address</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="Full address"
                  placeholderTextColor={colors.muted}
                  value={modal?.address}
                  onChangeText={v => setModal(m => m ? { ...m, address: v } : null)}
                  multiline
                />

                <Text style={styles.label}>Contact Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. +91 98765 43210"
                  placeholderTextColor={colors.muted}
                  value={modal?.contact_number}
                  onChangeText={v => setModal(m => m ? { ...m, contact_number: v } : null)}
                  keyboardType="phone-pad"
                />

                <Text style={styles.label}>Hours</Text>
                <View style={styles.row}>
                  {(['opens_at', 'closes_at'] as const).map(field => (
                    <Pressable key={field} onPress={() => openTimePicker(field)} style={[styles.timeBtn, styles.flex1]}>
                      <Feather name={field === 'opens_at' ? 'sunrise' : 'sunset'} size={13} color={colors.muted} />
                      <Text style={styles.timeBtnLabel}>{field === 'opens_at' ? 'Opens' : 'Closes'}</Text>
                      <Text style={styles.timeBtnValue}>
                        {formatTimeDisplay(modal?.[field] || (field === 'opens_at' ? '09:00' : '21:00'))}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.locationHeader}>
                  <Text style={styles.label}>Location (lat / lng)</Text>
                  <Pressable onPress={() => setMapVisible(true)} style={styles.mapPickBtn}>
                    <Feather name="map-pin" size={13} color={colors.brandPrimary} />
                    <Text style={styles.mapPickBtnText}>Pick on map</Text>
                  </Pressable>
                </View>
                <View style={styles.row}>
                  <TextInput
                    testID="store-latitude"
                    style={[styles.input, styles.flex1]}
                    placeholder="Latitude"
                    placeholderTextColor={colors.muted}
                    value={modal?.latitude}
                    onChangeText={v => setModal(m => m ? { ...m, latitude: v } : null)}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    testID="store-longitude"
                    style={[styles.input, styles.flex1]}
                    placeholder="Longitude"
                    placeholderTextColor={colors.muted}
                    value={modal?.longitude}
                    onChangeText={v => setModal(m => m ? { ...m, longitude: v } : null)}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={styles.actions}>
                  <Pressable onPress={() => setModal(null)} style={[styles.mBtn, styles.mBtnGhost]}>
                    <Text style={styles.mBtnGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable testID="save-store" onPress={save} disabled={saving} style={[styles.mBtn, { backgroundColor: colors.brandPrimary }]}>
                    {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.mBtnText}>Save</Text>}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Time picker modal ── */}
      <Modal visible={timePickerFor !== null} transparent animationType="slide" onRequestClose={cancelTimePicker}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={cancelTimePicker} />
          <View style={styles.timeSheet}>
            <View style={styles.timeSheetHeader}>
              <Pressable onPress={cancelTimePicker} hitSlop={12}>
                <Text style={styles.timeSheetCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.timeSheetTitle}>
                {timePickerFor === 'opens_at' ? 'Opening Time' : 'Closing Time'}
              </Text>
              <Pressable onPress={() => setTimePickerFor(null)} hitSlop={12}>
                <Text style={styles.timeSheetDone}>Done</Text>
              </Pressable>
            </View>
            {timePickerFor !== null && (
              <TimePickerWheel
                value={modal?.[timePickerFor] || (timePickerFor === 'opens_at' ? '09:00' : '21:00')}
                onChange={v => setModal(m => m ? { ...m, [timePickerFor!]: v } : null)}
              />
            )}
            <View style={{ height: 32 }} />
          </View>
        </View>
      </Modal>

      {/* ── Map picker (native: full map; web: no-op stub) ── */}
      <StoreMapPicker
        visible={mapVisible}
        latitude={modal?.latitude ?? ''}
        longitude={modal?.longitude ?? ''}
        onConfirm={(lat, lng) => {
          setModal(m => m ? { ...m, latitude: lat, longitude: lng } : null);
          setMapVisible(false);
        }}
        onClose={() => setMapVisible(false)}
      />
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

  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardThumb: { width: 52, height: 52, borderRadius: radius.sm, flexShrink: 0, backgroundColor: colors.surfaceTertiary },
  cardThumbPlaceholder: { width: 52, height: 52, borderRadius: radius.sm, flexShrink: 0, backgroundColor: colors.brandPrimary + '14', alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  name: { fontFamily: fonts.textBold, color: colors.onSurface, fontSize: 15, flex: 1 },
  editBtn: { padding: 4, marginLeft: spacing.sm },
  line: { fontFamily: fonts.text, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  coordText: { fontFamily: fonts.text, color: colors.muted, fontSize: 12 },
  meta: { fontFamily: fonts.textMedium, color: colors.muted, fontSize: 12, marginTop: spacing.sm },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: '90%' },
  modalTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginBottom: spacing.md },
  label: { fontFamily: fonts.textBold, fontSize: 11, color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: spacing.xs, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex1: { flex: 1 },

  // Image picker
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  imageBox: { width: 80, height: 80, borderRadius: radius.md, overflow: 'hidden', flexShrink: 0 },
  imagePreview: { width: 80, height: 80 },
  imagePlaceholder: { width: 80, height: 80, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 4 },
  imagePlaceholderText: { fontFamily: fonts.text, fontSize: 10, color: colors.muted },
  imageActions: { flex: 1, gap: spacing.sm },
  imageBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary },
  imageBtnText: { fontFamily: fonts.textBold, fontSize: 13, color: colors.brandPrimary },
  imageRemoveBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  imageRemoveText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.error ?? colors.muted },

  timeBtn: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  timeBtnLabel: { fontFamily: fonts.text, fontSize: 10, color: colors.muted, letterSpacing: 0.5, textTransform: 'uppercase' },
  timeBtnValue: { fontFamily: fonts.textBold, fontSize: 18, color: colors.onSurface },
  timeSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  timeSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  timeSheetTitle: { fontFamily: fonts.textMedium, fontSize: 15, color: colors.onSurface },
  timeSheetCancel: { fontFamily: fonts.textMedium, fontSize: 15, color: colors.muted },
  timeSheetDone: { fontFamily: fonts.textBold, fontSize: 15, color: colors.brandPrimary },
  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  mapPickBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary },
  mapPickBtnText: { fontFamily: fonts.textBold, fontSize: 12, color: colors.brandPrimary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  mBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  mBtnGhost: { borderWidth: 1, borderColor: colors.border },
  mBtnGhostText: { fontFamily: fonts.textMedium, color: colors.onSurface },
  mBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold },
});
