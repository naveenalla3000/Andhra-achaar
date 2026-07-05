import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

export default function AdminStores() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('stores').select('*,primary_seller:user_profiles!stores_primary_seller_id_fkey(id,full_name)').order('name');
    setStores(data || []); setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!modal.name || !modal.address) { Alert.alert('Name and address required'); return; }
    const { error } = await supabase.from('stores').insert({
      name: modal.name, address: modal.address,
      opens_at: modal.opens_at || '09:00', closes_at: modal.closes_at || '21:00',
      latitude: modal.latitude?.trim() || null,
      longitude: modal.longitude?.trim() || null,
    });
    if (error) { Alert.alert('Error', error.message); return; }
    setModal(null); load();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Stores</Text>
        <Pressable testID="add-store-btn" onPress={() => setModal({ name: '', address: '', opens_at: '09:00', closes_at: '21:00' })} style={styles.addBtn}>
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
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.line}>{item.address}</Text>
            <Text style={styles.line}>{item.opens_at} – {item.closes_at}</Text>
            <Text style={styles.meta}>Primary seller: {item.primary_seller?.full_name || 'unassigned'}</Text>
          </View>
        )}
      />
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View style={styles.backdrop}><View style={styles.modal}><ScrollView>
          <Text style={styles.modalTitle}>New Store</Text>
          <TextInput testID="store-name" style={styles.input} placeholder="Store name" placeholderTextColor={colors.muted} value={modal?.name} onChangeText={v => setModal((m: any) => ({ ...m, name: v }))} />
          <TextInput style={styles.input} placeholder="Address" placeholderTextColor={colors.muted} value={modal?.address} onChangeText={v => setModal((m: any) => ({ ...m, address: v }))} multiline />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Opens (09:00)" placeholderTextColor={colors.muted} value={modal?.opens_at} onChangeText={v => setModal((m: any) => ({ ...m, opens_at: v }))} />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Closes (21:00)" placeholderTextColor={colors.muted} value={modal?.closes_at} onChangeText={v => setModal((m: any) => ({ ...m, closes_at: v }))} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput testID="store-latitude" style={[styles.input, { flex: 1 }]} placeholder="Latitude (e.g. 17.385 N)" placeholderTextColor={colors.muted} value={modal?.latitude} onChangeText={v => setModal((m: any) => ({ ...m, latitude: v }))} autoCapitalize="characters" />
            <TextInput testID="store-longitude" style={[styles.input, { flex: 1 }]} placeholder="Longitude (e.g. 78.486 E)" placeholderTextColor={colors.muted} value={modal?.longitude} onChangeText={v => setModal((m: any) => ({ ...m, longitude: v }))} autoCapitalize="characters" />
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => setModal(null)} style={[styles.mBtn, styles.mBtnGhost]}><Text style={styles.mBtnGhostText}>Cancel</Text></Pressable>
            <Pressable testID="save-store" onPress={save} style={[styles.mBtn, { backgroundColor: colors.brandPrimary }]}><Text style={styles.mBtnText}>Save</Text></Pressable>
          </View>
        </ScrollView></View></View>
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
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  name: { fontFamily: fonts.textBold, color: colors.onSurface, fontSize: 15 },
  line: { fontFamily: fonts.text, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  meta: { fontFamily: fonts.textMedium, color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: '90%' },
  modalTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginBottom: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  mBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  mBtnGhost: { borderWidth: 1, borderColor: colors.border },
  mBtnGhostText: { fontFamily: fonts.textMedium, color: colors.onSurface },
  mBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold },
});
