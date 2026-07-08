import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts, statusColors } from '@/src/lib/theme';

const NEXT: Record<string, string> = {
  placed: 'accepted',
  accepted: 'ready_date_set',
  ready_date_set: 'ready_for_takeaway',
  ready_for_takeaway: 'completed',
};
const NEXT_LABEL: Record<string, string> = {
  placed: 'Accept', accepted: 'Set Ready Date', ready_date_set: 'Mark Ready',
  ready_for_takeaway: 'Complete',
};

export default function SellerOrders() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateModal, setDateModal] = useState<{ orderId: string; date: string } | null>(null);

  const load = useCallback(async () => {
    if (!profile?.store_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id,status,total_inr,ready_date,created_at,customer:user_profiles(full_name),order_items(pickle_name,variant_label,packaging_type_name,quantity)')
        .eq('store_id', profile.store_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders(data || []);
    } catch {}
    setLoading(false);
  }, [profile?.store_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const advance = async (order: any) => {
    const next = NEXT[order.status];
    if (!next) return;
    if (order.status === 'accepted') {
      // require ready date
      const d = new Date(); d.setDate(d.getDate() + 1);
      setDateModal({ orderId: order.id, date: d.toISOString().slice(0, 10) });
      return;
    }
    const { error } = await supabase.from('orders').update({ status: next, updated_at: new Date().toISOString() }).eq('id', order.id);
    if (error) Alert.alert('Error', error.message);
    load();
  };

  const saveReadyDate = async () => {
    if (!dateModal) return;
    const { error } = await supabase.from('orders').update({ status: 'ready_date_set', ready_date: dateModal.date, updated_at: new Date().toISOString() }).eq('id', dateModal.orderId);
    setDateModal(null);
    if (error) Alert.alert('Error', error.message);
    load();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.header}>Orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxxl }}
        ListEmptyComponent={<Text style={styles.empty}>No orders yet.</Text>}
        renderItem={({ item }) => {
          const s = statusColors[item.status] || { bg: colors.surfaceTertiary, fg: colors.onSurface, label: item.status };
          const nextLabel = NEXT_LABEL[item.status];
          return (
            <View style={styles.card} testID={`seller-order-${item.id}`}>
              <View style={styles.rowBetween}>
                <Text style={styles.customer}>{item.customer?.full_name || 'Customer'}</Text>
                <View style={[styles.badge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
                </View>
              </View>
              {(item.order_items || []).map((oi: any, i: number) => (
                <Text key={i} style={styles.line}>
                  {oi.quantity}× {oi.pickle_name} ({[oi.variant_label, oi.packaging_type_name].filter(Boolean).join(' · ')})
                </Text>
              ))}
              <View style={styles.rowBetween}>
                <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
                <Text style={styles.total}>₹{Number(item.total_inr).toFixed(0)}</Text>
              </View>
              {item.ready_date && <Text style={styles.ready}>Ready: {item.ready_date}</Text>}
              {nextLabel && (
                <Pressable testID={`advance-${item.id}`} onPress={() => advance(item)} style={styles.advance}>
                  <Text style={styles.advanceText}>{nextLabel}</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
      <Modal visible={!!dateModal} transparent animationType="fade" onRequestClose={() => setDateModal(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDateModal(null)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <Text style={styles.modalTitle}>Set Ready Date</Text>
            <Text style={styles.modalSub}>Format: YYYY-MM-DD</Text>
            <TextInput
              testID="ready-date-input"
              value={dateModal?.date || ''}
              onChangeText={(v) => setDateModal(prev => prev ? { ...prev, date: v } : null)}
              style={styles.input}
              placeholder="2026-06-01"
              placeholderTextColor={colors.muted}
            />
            <Pressable testID="save-ready-date" onPress={saveReadyDate} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Confirm</Text>
            </Pressable>
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
  empty: { color: colors.muted, textAlign: 'center', fontFamily: fonts.text, marginTop: spacing.xl },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customer: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.textBold, fontSize: 10, letterSpacing: 0.5 },
  line: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary },
  date: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },
  total: { fontFamily: fonts.textBold, fontSize: 15, color: colors.brandPrimary },
  ready: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.success },
  advance: { marginTop: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  advanceText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modal: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, width: '100%', maxWidth: 400 },
  modalTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },
  modalSub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginBottom: spacing.md, marginTop: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.text, color: colors.onSurface },
  saveBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  saveBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold },
});
