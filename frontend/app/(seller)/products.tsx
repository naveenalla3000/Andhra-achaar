import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, TextInput, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

export default function SellerProducts() {
  const { profile } = useAuth();
  const [pickles, setPickles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ name: string; description: string; image_url: string; ingredients: string; pkgs: { label: string; price: string }[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.store_id) return;
    setLoading(true);
    const { data } = await supabase.from('pickles').select('*,packaging_options(*)').eq('store_id', profile.store_id).order('created_at', { ascending: false });
    setPickles(data || []); setLoading(false);
  }, [profile?.store_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAdd = () => setModal({ name: '', description: '', image_url: '', ingredients: '', pkgs: [{ label: '250g Jar', price: '199' }] });

  const save = async () => {
    if (!modal || !profile?.store_id) return;
    if (!modal.name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    const { data: pkl, error } = await supabase.from('pickles').insert({
      store_id: profile.store_id, name: modal.name, description: modal.description || null,
      image_url: modal.image_url || null, ingredients: modal.ingredients || null,
    }).select().single();
    if (error || !pkl) { setSaving(false); Alert.alert('Error', error?.message || 'Save failed'); return; }
    const pkgRows = modal.pkgs.filter(p => p.label && p.price).map(p => ({ pickle_id: pkl.id, label: p.label, price_inr: Number(p.price) }));
    if (pkgRows.length) await supabase.from('packaging_options').insert(pkgRows);
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
        {canAdd && <Pressable testID="add-pickle-btn" onPress={openAdd} style={styles.addBtn}><Feather name="plus" size={18} color={colors.onBrandPrimary} /></Pressable>}
      </View>
      <FlatList
        data={pickles}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl }}
        ListEmptyComponent={<Text style={styles.empty}>No pickles yet. Add your first one.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.name}>{item.name}</Text>
              <Pressable testID={`toggle-${item.id}`} onPress={() => toggle(item.id, !item.is_active)}>
                <Text style={[styles.status, { color: item.is_active ? colors.success : colors.muted }]}>{item.is_active ? 'ACTIVE' : 'HIDDEN'}</Text>
              </Pressable>
            </View>
            {item.description && <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>}
            <View style={styles.pkgs}>
              {(item.packaging_options || []).map((p: any) => (
                <View key={p.id} style={styles.pkg}><Text style={styles.pkgLabel}>{p.label}</Text><Text style={styles.pkgPrice}>₹{p.price_inr}</Text></View>
              ))}
            </View>
          </View>
        )}
      />
      <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <ScrollView>
              <Text style={styles.modalTitle}>Add Pickle</Text>
              <TextInput testID="new-pickle-name" style={styles.input} placeholder="Name (e.g. Mango Avakaya)" placeholderTextColor={colors.muted} value={modal?.name || ''} onChangeText={v => setModal(prev => prev ? { ...prev, name: v } : null)} />
              <TextInput style={styles.input} placeholder="Description" placeholderTextColor={colors.muted} value={modal?.description || ''} onChangeText={v => setModal(prev => prev ? { ...prev, description: v } : null)} multiline />
              <TextInput style={styles.input} placeholder="Image URL (optional)" placeholderTextColor={colors.muted} value={modal?.image_url || ''} onChangeText={v => setModal(prev => prev ? { ...prev, image_url: v } : null)} autoCapitalize="none" />
              <TextInput style={styles.input} placeholder="Ingredients" placeholderTextColor={colors.muted} value={modal?.ingredients || ''} onChangeText={v => setModal(prev => prev ? { ...prev, ingredients: v } : null)} multiline />
              <Text style={styles.pkgHeader}>Packaging Options</Text>
              {modal?.pkgs.map((p, i) => (
                <View key={i} style={styles.pkgRow}>
                  <TextInput style={[styles.input, { flex: 2, marginRight: spacing.sm }]} placeholder="e.g. 500g Jar" placeholderTextColor={colors.muted} value={p.label} onChangeText={v => setModal(prev => { if (!prev) return null; const pkgs = [...prev.pkgs]; pkgs[i] = { ...pkgs[i], label: v }; return { ...prev, pkgs }; })} />
                  <TextInput style={[styles.input, { flex: 1 }]} placeholder="Price" placeholderTextColor={colors.muted} value={p.price} keyboardType="numeric" onChangeText={v => setModal(prev => { if (!prev) return null; const pkgs = [...prev.pkgs]; pkgs[i] = { ...pkgs[i], price: v }; return { ...prev, pkgs }; })} />
                </View>
              ))}
              <Pressable testID="add-pkg-row" onPress={() => setModal(prev => prev ? { ...prev, pkgs: [...prev.pkgs, { label: '', price: '' }] } : null)}><Text style={styles.addPkg}>+ Add packaging</Text></Pressable>
              <View style={styles.modalActions}>
                <Pressable testID="cancel-modal" onPress={() => setModal(null)} style={[styles.mBtn, styles.mBtnGhost]}><Text style={styles.mBtnGhostText}>Cancel</Text></Pressable>
                <Pressable testID="save-pickle" onPress={save} disabled={saving} style={[styles.mBtn, { backgroundColor: colors.brandPrimary }]}>
                  {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.mBtnText}>Save</Text>}
                </Pressable>
              </View>
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
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl, fontFamily: fonts.text },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface, flex: 1 },
  status: { fontFamily: fonts.textBold, fontSize: 10, letterSpacing: 1 },
  desc: { fontFamily: fonts.text, color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  pkgs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  pkg: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, flexDirection: 'row', gap: 6 },
  pkgLabel: { fontFamily: fonts.text, fontSize: 11, color: colors.onSurfaceTertiary },
  pkgPrice: { fontFamily: fonts.textBold, fontSize: 11, color: colors.brandPrimary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: '90%' },
  modalTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginBottom: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, fontFamily: fonts.text, color: colors.onSurface, backgroundColor: colors.surfaceSecondary },
  pkgHeader: { fontFamily: fonts.textBold, marginTop: spacing.md, marginBottom: spacing.sm, color: colors.onSurface },
  pkgRow: { flexDirection: 'row' },
  addPkg: { color: colors.brandPrimary, fontFamily: fonts.textMedium, marginBottom: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  mBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  mBtnGhost: { borderWidth: 1, borderColor: colors.border },
  mBtnGhostText: { fontFamily: fonts.textMedium, color: colors.onSurface },
  mBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold },
});
