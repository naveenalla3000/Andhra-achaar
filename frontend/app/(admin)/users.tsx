import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const ROLES = ['customer', 'sub_seller', 'primary_seller', 'admin'];
const STORE_ROLES = ['primary_seller', 'sub_seller'];

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [draftRole, setDraftRole] = useState<string>('customer');
  const [draftStoreId, setDraftStoreId] = useState<string | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.from('user_profiles').select('*,store:stores!user_profiles_store_id_fkey(id,name)').order('created_at', { ascending: false });
    setUsers(u || []);
    const { data: s } = await supabase.from('stores').select('id,name,primary_seller_id').order('name');
    setStores(s || []);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openUser = (item: any) => {
    setSelectedUser(item);
    setDraftRole(item.role);
    setDraftStoreId(item.store_id ?? null);
  };

  // Stores with no primary seller yet, plus whichever store this user already leads (if any).
  const availableStores = stores.filter(s => !s.primary_seller_id || s.primary_seller_id === selectedUser?.id);

  const save = async () => {
    if (!selectedUser) return;
    const needsStore = STORE_ROLES.includes(draftRole);
    const finalStoreId = needsStore ? draftStoreId : null;

    if (selectedUser.role === 'primary_seller' && selectedUser.store_id && selectedUser.store_id !== finalStoreId) {
      const { error } = await supabase.from('stores').update({ primary_seller_id: null }).eq('id', selectedUser.store_id).eq('primary_seller_id', selectedUser.id);
      if (error) { Alert.alert('Error', error.message); return; }
    }

    const { error } = await supabase
      .from('user_profiles')
      .update({ role: draftRole, store_id: finalStoreId })
      .eq('supabase_id', selectedUser.supabase_id);
    if (error) { Alert.alert('Error', error.message); return; }

    if (draftRole === 'primary_seller' && finalStoreId) {
      const { error: assignErr } = await supabase.from('stores').update({ primary_seller_id: selectedUser.id }).eq('id', finalStoreId);
      if (assignErr) { Alert.alert('Error', assignErr.message); return; }
    }

    setSelectedUser(null); load();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.header}>Users</Text>
      <FlatList
        data={users}
        keyExtractor={u => u.id}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl }}
        ListEmptyComponent={<Text style={styles.empty}>No users yet.</Text>}
        renderItem={({ item }) => (
          <Pressable testID={`user-${item.id}`} onPress={() => openUser(item)} style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.name}>{item.full_name || '—'}</Text>
              <View style={[styles.badge, { backgroundColor: item.role === 'admin' ? colors.brandPrimary : colors.surfaceTertiary }]}>
                <Text style={[styles.badgeText, { color: item.role === 'admin' ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>{item.role.replace('_', ' ')}</Text>
              </View>
            </View>
            {item.store && <Text style={styles.meta}>Store: {item.store.name}</Text>}
          </Pressable>
        )}
      />
      <Modal visible={!!selectedUser} transparent animationType="fade" onRequestClose={() => setSelectedUser(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedUser(null)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <ScrollView>
              <Text style={styles.modalTitle}>{selectedUser?.full_name}</Text>
              <Text style={styles.modalSub}>Role</Text>
              <Pressable testID="role-field" onPress={() => setRoleOpen(o => !o)} style={styles.field}>
                <Text style={styles.fieldText}>{draftRole.replace('_', ' ')}</Text>
                <Feather name={roleOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
              </Pressable>
              {roleOpen && (
                <View style={styles.optionList}>
                  {ROLES.map(r => (
                    <Pressable
                      key={r}
                      testID={`role-option-${r}`}
                      onPress={() => { setDraftRole(r); if (!STORE_ROLES.includes(r)) setDraftStoreId(null); setRoleOpen(false); }}
                      style={styles.option}
                    >
                      <Text style={styles.optionText}>{r.replace('_', ' ')}</Text>
                      {draftRole === r && <Feather name="check" size={16} color={colors.brandPrimary} />}
                    </Pressable>
                  ))}
                </View>
              )}
              {STORE_ROLES.includes(draftRole) && (
                <>
                  <Text style={styles.modalSub}>Store</Text>
                  <Pressable testID="store-field" onPress={() => setStoreOpen(o => !o)} style={styles.field}>
                    <Text style={styles.fieldText}>{stores.find(s => s.id === draftStoreId)?.name || 'Select a store…'}</Text>
                    <Feather name={storeOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                  </Pressable>
                  {storeOpen && (
                    <View style={styles.optionList}>
                      {availableStores.length === 0 && <Text style={styles.emptyOption}>No unassigned stores</Text>}
                      {availableStores.map(s => (
                        <Pressable key={s.id} testID={`store-option-${s.id}`} onPress={() => { setDraftStoreId(s.id); setStoreOpen(false); }} style={styles.option}>
                          <Text style={styles.optionText}>{s.name}</Text>
                          {draftStoreId === s.id && <Feather name="check" size={16} color={colors.brandPrimary} />}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              )}
              <Pressable testID="save-role" onPress={save} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, padding: spacing.xl, paddingBottom: spacing.md },
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl, fontFamily: fonts.text },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: fonts.textBold, color: colors.onSurface, fontSize: 15 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.textBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  meta: { fontFamily: fonts.text, color: colors.muted, fontSize: 12, marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, maxHeight: '80%' },
  modalTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },
  modalSub: { fontFamily: fonts.textBold, color: colors.muted, fontSize: 12, letterSpacing: 1, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: 'uppercase' },
  field: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  fieldText: { fontFamily: fonts.textMedium, color: colors.onSurface, textTransform: 'capitalize' },
  optionList: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: spacing.xs, overflow: 'hidden' },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  optionText: { fontFamily: fonts.textMedium, color: colors.onSurface, textTransform: 'capitalize' },
  emptyOption: { fontFamily: fonts.text, color: colors.muted, fontSize: 12, padding: spacing.md },
  saveBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  saveBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold },
});
