import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

const ROLES = ['customer', 'sub_seller', 'primary_seller', 'admin'];

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.from('user_profiles').select('*,store:stores(id,name)').order('created_at', { ascending: false });
    setUsers(u || []);
    const { data: s } = await supabase.from('stores').select('id,name').order('name');
    setStores(s || []);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const promote = async (role: string, storeId: string | null) => {
    if (!selectedUser) return;
    const { error } = await supabase
      .from('user_profiles')
      .update({ role, store_id: storeId })
      .eq('supabase_id', selectedUser.supabase_id);
    if (error) { Alert.alert('Error', error.message); return; }
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
          <Pressable testID={`user-${item.id}`} onPress={() => setSelectedUser(item)} style={styles.card}>
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
      <Modal visible={!!selectedUser} transparent animationType="slide" onRequestClose={() => setSelectedUser(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedUser(null)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <Text style={styles.modalTitle}>{selectedUser?.full_name}</Text>
            <Text style={styles.modalSub}>Set role</Text>
            {ROLES.map(r => (
              <Pressable key={r} testID={`role-${r}`} onPress={() => promote(r, null)} style={styles.roleBtn}>
                <Text style={styles.roleBtnText}>{r.replace('_', ' ')}</Text>
              </Pressable>
            ))}
            <Text style={styles.modalSub}>Assign to store (as seller)</Text>
            {stores.map(s => (
              <Pressable key={s.id} testID={`store-assign-${s.id}`} onPress={() => promote('primary_seller', s.id)} style={styles.roleBtn}>
                <Text style={styles.roleBtnText}>Primary Seller · {s.name}</Text>
              </Pressable>
            ))}
            {stores.map(s => (
              <Pressable key={`sub-${s.id}`} testID={`store-assign-sub-${s.id}`} onPress={() => promote('sub_seller', s.id)} style={styles.roleBtn}>
                <Text style={styles.roleBtnText}>Sub-Seller · {s.name}</Text>
              </Pressable>
            ))}
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
  roleBtn: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs },
  roleBtnText: { fontFamily: fonts.textMedium, color: colors.onSurface, textTransform: 'capitalize' },
});
