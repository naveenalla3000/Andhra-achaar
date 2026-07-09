import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Modal, Alert, Linking, Platform, TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts, statusColors } from '@/src/lib/theme';

type PickerStep = 'date' | 'time' | null;

type TimelineEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_name: string;
  actor_role: string;
  sub_seller_name: string | null;
  created_at: string;
};

const NEXT_STATUS: Record<string, string> = {
  placed: 'accepted',
  ready_date_set: 'ready_for_takeaway',
  ready_for_takeaway: 'completed',
};

const NEXT_LABEL: Record<string, string> = {
  placed: 'Accept Order',
  accepted: 'Set Ready Date & Time',
  ready_date_set: 'Mark Ready for Pickup',
  ready_for_takeaway: 'Mark Completed',
};

const TL_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  placed: 'shopping-bag',
  accepted: 'check-circle',
  ready_date_set: 'calendar',
  ready_for_takeaway: 'package',
  completed: 'check-circle',
  cancelled: 'x-circle',
  assigned: 'user-plus',
  unassigned: 'user-minus',
};

const TL_COLOR: Record<string, string> = {
  placed: colors.muted,
  accepted: colors.success,
  ready_date_set: colors.brandPrimary,
  ready_for_takeaway: colors.brandPrimary,
  completed: colors.success,
  cancelled: colors.error,
  assigned: colors.brandPrimary,
  unassigned: colors.muted,
};

function tLabel(ev: TimelineEvent): string {
  if (ev.event_type === 'placed') return 'Order placed';
  if (ev.event_type === 'assigned') return `Assigned to ${ev.sub_seller_name ?? 'sub-seller'}`;
  if (ev.event_type === 'unassigned')
    return ev.sub_seller_name ? `Unassigned from ${ev.sub_seller_name}` : 'Assignment removed';
  const map: Record<string, string> = {
    accepted: 'Order accepted',
    ready_date_set: 'Ready date & time set',
    ready_for_takeaway: 'Ready for pickup',
    completed: 'Order completed',
    cancelled: 'Order cancelled',
  };
  return map[ev.to_status ?? ''] ?? (ev.to_status ?? ev.event_type);
}

function tIcon(ev: TimelineEvent): keyof typeof Feather.glyphMap {
  const key = ev.event_type === 'status_change' ? ev.to_status ?? '' : ev.event_type;
  return TL_ICON[key] ?? 'circle';
}

function tColor(ev: TimelineEvent): string {
  const key = ev.event_type === 'status_change' ? ev.to_status ?? '' : ev.event_type;
  return TL_COLOR[key] ?? colors.muted;
}

function actorLine(ev: TimelineEvent): string {
  if (ev.event_type === 'placed') return `by ${ev.actor_name}`;
  if (ev.event_type === 'assigned' || ev.event_type === 'unassigned') return `by ${ev.actor_name}`;
  if (['accepted', 'completed', 'cancelled'].includes(ev.to_status ?? '')) return `by ${ev.actor_name}`;
  if (ev.to_status === 'ready_date_set' || ev.to_status === 'ready_for_takeaway') return `by ${ev.actor_name}`;
  return `by ${ev.actor_name}`;
}

const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

function pickupCode(orderId: string): string {
  const n = parseInt(orderId.replace(/-/g, '').slice(0, 8), 16);
  return String((n % 900000) + 100000).split('').join(' ');
}

const ASSIGNABLE = new Set(['accepted', 'ready_date_set', 'ready_for_takeaway']);

export default function SellerOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const isPrimary = profile?.role === 'primary_seller';

  const [order, setOrder] = useState<any>(null);
  const [customer, setCustomer] = useState<{ full_name: string; email: string | null; phone: string | null } | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [subSellers, setSubSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [pickerStep, setPickerStep] = useState<PickerStep>(null);
  const [pickedDate, setPickedDate] = useState(new Date());
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');
  const [codeError, setCodeError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [orderRes, tlRes, custRes, ssRes] = await Promise.all([
      supabase
        .from('orders')
        .select([
          'id,status,total_inr,ready_date,created_at,order_ref,assigned_to,store_name,store_id',
          'assigned_seller:user_profiles!orders_assigned_to_fkey(id,full_name)',
          'order_items(id,pickle_name,variant_label,packaging_type_name,quantity,line_total_inr)',
        ].join(','))
        .eq('id', id)
        .single(),
      supabase
        .from('order_timeline')
        .select('id,event_type,from_status,to_status,actor_name,actor_role,sub_seller_name,created_at')
        .eq('order_id', id)
        .order('created_at', { ascending: true }),
      supabase.rpc('get_order_customer_details', { p_order_id: id }),
      isPrimary && profile?.store_id
        ? supabase.from('user_profiles').select('id,full_name').eq('store_id', profile.store_id).eq('role', 'sub_seller')
        : Promise.resolve({ data: [] }),
    ]);

    setOrder(orderRes.data ?? null);
    setTimeline(tlRes.data ?? []);
    if (custRes.data?.[0]) setCustomer(custRes.data[0]);
    setSubSellers((ssRes as any).data ?? []);
    setLoading(false);
  }, [id, isPrimary, profile?.store_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const advanceStatus = async () => {
    const next = NEXT_STATUS[order?.status];
    if (!next) return;
    const { error } = await supabase
      .from('orders')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) Alert.alert('Error', error.message);
    else load();
  };

  const saveReadyDateTime = async (dt: Date) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'ready_date_set', ready_date: dt.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) Alert.alert('Error', error.message);
    else load();
  };

  const handleAdvancePress = () => {
    if (!order) return;
    if (order.status === 'accepted') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(11, 0, 0, 0);
      setPickedDate(d);
      setPickerStep('date');
    } else if (order.status === 'ready_for_takeaway') {
      setEnteredCode('');
      setCodeError('');
      setCodeModalVisible(true);
    } else {
      advanceStatus();
    }
  };

  const handleChangeDatePress = () => {
    const d = order.ready_date ? new Date(order.ready_date) : new Date();
    setPickedDate(d);
    setPickerStep('date');
  };

  const verifyAndComplete = () => {
    const expected = pickupCode(order.id).replace(/\s/g, '');
    const entered = enteredCode.replace(/\s/g, '');
    if (entered !== expected) {
      setCodeError('Incorrect code. Please try again.');
      return;
    }
    setCodeModalVisible(false);
    advanceStatus();
  };

  // Android: date dialog → time dialog → save
  const onAndroidPickerChange = (event: any, selected?: Date) => {
    if (event.type === 'dismissed') { setPickerStep(null); return; }
    if (!selected) { setPickerStep(null); return; }
    if (pickerStep === 'date') {
      const merged = new Date(selected);
      merged.setHours(pickedDate.getHours(), pickedDate.getMinutes());
      setPickedDate(merged);
      setPickerStep('time');
    } else {
      setPickerStep(null);
      const merged = new Date(pickedDate);
      merged.setHours(selected.getHours(), selected.getMinutes());
      saveReadyDateTime(merged);
    }
  };

  const onIosPickerNext = () => {
    if (pickerStep === 'date') { setPickerStep('time'); return; }
    setPickerStep(null);
    saveReadyDateTime(pickedDate);
  };

  const assignSubSeller = async (subSellerId: string | null) => {
    const { error } = await supabase
      .from('orders')
      .update({ assigned_to: subSellerId, updated_at: new Date().toISOString() })
      .eq('id', id);
    setAssignModalVisible(false);
    if (error) Alert.alert('Error', error.message);
    else load();
  };

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Feather name="arrow-left" size={20} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>Order Detail</Text>
        </View>
        <View style={styles.center}>
          {loading
            ? <ActivityIndicator color={colors.brandPrimary} />
            : <Text style={styles.empty}>Order not found.</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const s = statusColors[order.status] || { bg: colors.surfaceTertiary, fg: colors.onSurface, label: order.status };
  const canAdvance = NEXT_STATUS[order.status] != null || order.status === 'accepted';
  const showAdvance = canAdvance && (isPrimary || order.status !== 'placed');
  const advanceLabel = NEXT_LABEL[order.status];
  const isTerminal = order.status === 'completed' || order.status === 'cancelled';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{order.order_ref ?? 'Order Detail'}</Text>
          <Text style={styles.headerSub}>Ordered: {fmtDT(order.created_at)}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: s.bg }]}>
          <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Customer ── */}
        {customer && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Feather name="user" size={14} color={colors.muted} />
              <Text style={styles.sectionTitle}>Customer</Text>
            </View>
            <Text style={styles.customerName}>{customer.full_name}</Text>
            <View style={styles.contactList}>
              {customer.phone ? (
                <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`tel:${customer.phone}`)}>
                  <Feather name="phone" size={13} color={colors.brandPrimary} />
                  <Text style={styles.contactText}>{customer.phone}</Text>
                </Pressable>
              ) : null}
              {customer.email ? (
                <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`mailto:${customer.email}`)}>
                  <Feather name="mail" size={13} color={colors.brandPrimary} />
                  <Text style={styles.contactText}>{customer.email}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}

        {/* ── Order items ── */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Feather name="package" size={14} color={colors.muted} />
            <Text style={styles.sectionTitle}>Items</Text>
          </View>
          {(order.order_items ?? []).map((oi: any) => (
            <View key={oi.id} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={2}>
                {oi.quantity}× {oi.pickle_name}
                {oi.variant_label ? ` · ${oi.variant_label}` : ''}
                {oi.packaging_type_name ? ` · ${oi.packaging_type_name}` : ''}
              </Text>
              <Text style={styles.itemPrice}>₹{fmt(Number(oi.line_total_inr))}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalVal}>₹{fmt(Number(order.total_inr))}</Text>
          </View>
        </View>

        {/* ── Ready date/time ── */}
        {order.ready_date && (
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeader}>
                <Feather name="clock" size={14} color={colors.success} />
                <Text style={[styles.sectionTitle, { color: colors.success }]}>Pickup Scheduled</Text>
              </View>
              {showAdvance && order.status === 'ready_date_set' && (
                <Pressable onPress={handleChangeDatePress} style={styles.changeDateBtn}>
                  <Feather name="edit-2" size={12} color={colors.brandPrimary} />
                  <Text style={styles.changeDateText}>Change</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.readyDateTime}>{fmtDT(order.ready_date)}</Text>
          </View>
        )}

        {/* ── Actions ── */}
        {!isTerminal && (
          <View style={styles.card}>

            {/* Advance status */}
            {showAdvance && (
              <Pressable onPress={handleAdvancePress} style={styles.advanceBtn}>
                <Text style={styles.advanceBtnText}>{advanceLabel}</Text>
              </Pressable>
            )}

            {/* Assignment (primary seller only) */}
            {isPrimary && ASSIGNABLE.has(order.status) && (
              <Pressable
                onPress={() => setAssignModalVisible(true)}
                style={[styles.assignRow, showAdvance && { marginTop: spacing.sm }]}
              >
                <Feather
                  name={order.assigned_seller ? 'user-check' : 'user'}
                  size={14}
                  color={order.assigned_seller ? colors.brandPrimary : colors.muted}
                />
                <Text style={[styles.assignLabel, order.assigned_seller && styles.assignLabelActive]}>
                  {order.assigned_seller ? `Assigned: ${order.assigned_seller.full_name}` : 'Unassigned — tap to assign sub-seller'}
                </Text>
                <Feather name="chevron-right" size={14} color={colors.muted} />
              </Pressable>
            )}
          </View>
        )}

        {/* ── Timeline ── */}
        {timeline.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Feather name="activity" size={14} color={colors.muted} />
              <Text style={styles.sectionTitle}>History</Text>
            </View>
            {timeline.map((ev, idx) => {
              const isLast = idx === timeline.length - 1;
              const color = tColor(ev);
              return (
                <View key={ev.id} style={styles.tlRow}>
                  {/* Dot + line */}
                  <View style={styles.tlTrack}>
                    <View style={[styles.tlDot, { backgroundColor: color }]}>
                      <Feather name={tIcon(ev)} size={10} color="#fff" />
                    </View>
                    {!isLast && <View style={styles.tlLine} />}
                  </View>

                  {/* Content */}
                  <View style={styles.tlContent}>
                    <Text style={[styles.tlLabel, { color }]}>{tLabel(ev)}</Text>
                    <Text style={styles.tlActor}>{actorLine(ev)}</Text>
                    <Text style={[styles.tlTime, isLast ? { marginBottom: 0 } : { marginBottom: spacing.md }]}>
                      {fmtDT(ev.created_at)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      {/* ── iOS Date/Time Picker Modal ── */}
      {Platform.OS === 'ios' && (
        <Modal visible={pickerStep !== null} transparent animationType="slide" onRequestClose={() => setPickerStep(null)}>
          <View style={styles.pickerBackdrop}>
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Pressable onPress={() => setPickerStep(null)} hitSlop={8}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </Pressable>
                <Text style={styles.pickerTitle}>
                  {pickerStep === 'date' ? 'Pickup Date' : 'Pickup Time'}
                </Text>
                <Pressable onPress={onIosPickerNext} hitSlop={8}>
                  <Text style={styles.pickerNext}>
                    {pickerStep === 'date' ? 'Next' : 'Confirm'}
                  </Text>
                </Pressable>
              </View>
              {pickerStep !== null && (
                <DateTimePicker
                  value={pickedDate}
                  mode={pickerStep}
                  display="spinner"
                  minimumDate={pickerStep === 'date' ? new Date() : undefined}
                  onChange={(_, d) => { if (d) setPickedDate(d); }}
                  style={styles.pickerControl}
                />
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* ── Android Date/Time Picker (native dialog) ── */}
      {Platform.OS === 'android' && pickerStep !== null && (
        <DateTimePicker
          value={pickedDate}
          mode={pickerStep}
          display="default"
          minimumDate={pickerStep === 'date' ? new Date() : undefined}
          onChange={onAndroidPickerChange}
        />
      )}

      {/* ── Pickup Code Verification Modal ── */}
      <Modal visible={codeModalVisible} transparent animationType="fade" onRequestClose={() => setCodeModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCodeModalVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Verify Pickup Code</Text>
            <Text style={styles.modalSub}>Ask the customer to show their code</Text>
            <TextInput
              style={styles.codeInput}
              value={enteredCode}
              onChangeText={(t) => { setEnteredCode(t.replace(/\D/g, '')); setCodeError(''); }}
              placeholder="000000"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            {codeError ? <Text style={styles.codeError}>{codeError}</Text> : null}
            <Pressable onPress={verifyAndComplete} style={[styles.advanceBtn, { marginTop: spacing.md }]}>
              <Text style={styles.advanceBtnText}>Confirm &amp; Complete</Text>
            </Pressable>
            <Pressable onPress={() => setCodeModalVisible(false)} style={styles.codeCancel}>
              <Text style={styles.codeCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Assign sub-seller Modal ── */}
      <Modal visible={assignModalVisible} transparent animationType="fade" onRequestClose={() => setAssignModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAssignModalVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Assign Order</Text>
            <Text style={styles.modalSub}>Select who will handle this order</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {subSellers.length === 0 ? (
                <Text style={styles.noSubSellers}>No sub-sellers assigned to this store.</Text>
              ) : subSellers.map((ss: any) => {
                const selected = order.assigned_to === ss.id;
                return (
                  <Pressable
                    key={ss.id}
                    onPress={() => assignSubSeller(ss.id)}
                    style={[styles.ssOption, selected && styles.ssOptionSelected]}
                  >
                    <Text style={[styles.ssName, selected && styles.ssNameSelected]}>{ss.full_name}</Text>
                    {selected && <Feather name="check" size={16} color={colors.brandPrimary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            {order.assigned_to && (
              <Pressable onPress={() => assignSubSeller(null)} style={styles.unassignBtn}>
                <Feather name="x-circle" size={14} color={colors.error} />
                <Text style={styles.unassignText}>Remove Assignment</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.text, color: colors.muted },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: 18, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border, flexShrink: 0,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.onSurface },
  headerSub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, flexShrink: 0 },
  badgeText: { fontFamily: fonts.textBold, fontSize: 10, letterSpacing: 0.5 },

  scroll: { padding: spacing.lg, gap: spacing.md },

  // Cards
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionTitle: { fontFamily: fonts.textBold, fontSize: 11, color: colors.muted, letterSpacing: 1, textTransform: 'uppercase' },

  // Customer
  customerName: { fontFamily: fonts.display, fontSize: 17, color: colors.onSurface },
  contactList: { gap: spacing.xs },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  contactText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.brandPrimary },

  // Items
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  itemName: { fontFamily: fonts.text, fontSize: 13, color: colors.onSurfaceTertiary, flex: 1 },
  itemPrice: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface, flexShrink: 0 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs,
  },
  totalLabel: { fontFamily: fonts.textBold, fontSize: 14, color: colors.onSurface },
  totalVal: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },

  // Ready date
  readyDateTime: { fontFamily: fonts.display, fontSize: 16, color: colors.success },

  // Actions
  advanceBtn: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  advanceBtnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 14 },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  changeDateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  changeDateText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary },

  assignRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  assignLabel: { flex: 1, fontFamily: fonts.textMedium, fontSize: 13, color: colors.muted },
  assignLabelActive: { color: colors.brandPrimary },

  // Timeline
  tlRow: { flexDirection: 'row', gap: spacing.md },
  tlTrack: { alignItems: 'center', width: 24 },
  tlDot: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  tlLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 4 },
  tlContent: { flex: 1, paddingTop: 2 },
  tlLabel: { fontFamily: fonts.textBold, fontSize: 13 },
  tlActor: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginTop: 2 },
  tlTime: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, marginTop: 2 },

  // iOS Date Picker Sheet
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing.xl },
  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickerTitle: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface },
  pickerCancel: { fontFamily: fonts.textMedium, fontSize: 15, color: colors.muted },
  pickerNext: { fontFamily: fonts.textBold, fontSize: 15, color: colors.brandPrimary },
  pickerControl: { backgroundColor: colors.surface },

  // Assign modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.xl, maxHeight: '70%',
  },
  modalTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },
  modalSub: { fontFamily: fonts.text, fontSize: 12, color: colors.muted, marginBottom: spacing.md, marginTop: spacing.xs },
  noSubSellers: { fontFamily: fonts.text, color: colors.muted, padding: spacing.md },
  ssOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, borderRadius: radius.sm, marginBottom: spacing.xs,
  },
  ssOptionSelected: { backgroundColor: colors.surfaceSecondary },
  ssName: { fontFamily: fonts.textMedium, color: colors.onSurface },
  ssNameSelected: { color: colors.brandPrimary, fontFamily: fonts.textBold },
  unassignBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm,
  },
  unassignText: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.error },

  // Code verification modal
  codeInput: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.display,
    fontSize: 32,
    color: colors.onSurface,
    letterSpacing: 10,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  codeError: {
    fontFamily: fonts.textMedium,
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  codeCancel: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  codeCancelText: { fontFamily: fonts.textMedium, fontSize: 14, color: colors.muted },
});
