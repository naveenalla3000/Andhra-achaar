import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts, statusColors } from '@/src/lib/theme';

const FALLBACK = 'https://images.unsplash.com/photo-1617854307432-13950e24ba07?w=120&q=60';
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

const C = 68;
const G = 1;
const H = (C - G) / 2;

type OrderItem = { quantity: number; pickle_image_url: string | null };

type OrderRow = {
  id: string;
  checkout_id: string;
  order_ref: string;
  status: string;
  total_inr: string;
  created_at: string;
  store_name: string | null;
  order_items: OrderItem[];
};

type CheckoutGroup = {
  checkout_id: string;
  order_ref: string;
  created_at: string;
  total: number;
  lineItemCount: number;
  images: (string | null)[];
  firstStoreName: string | null;
  extraStoreCount: number;
  orders: OrderRow[];
};

function Tile({ url, w, h, overlay, extra }: {
  url: string | null; w: number; h: number; overlay?: boolean; extra?: number;
}) {
  return (
    <View style={{ width: w, height: h }}>
      <Image source={url || FALLBACK} style={{ width: w, height: h }} contentFit="cover" />
      {overlay && extra != null && extra > 0 && (
        <View style={styles.tileOverlay}>
          <Text style={styles.tileOverlayText}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

function PhotoCollage({ images, lineItemCount }: { images: (string | null)[]; lineItemCount: number }) {
  const extra = lineItemCount > 4 ? lineItemCount - 4 : 0;
  const show = images.slice(0, 4);
  const n = show.length;

  return (
    <View style={styles.collage}>
      {n === 1 && <Tile url={show[0]} w={C} h={C} />}
      {n === 2 && (
        <View style={{ flexDirection: 'row', gap: G }}>
          <Tile url={show[0]} w={H} h={C} />
          <Tile url={show[1]} w={H} h={C} />
        </View>
      )}
      {n === 3 && (
        <View style={{ gap: G }}>
          <Tile url={show[0]} w={C} h={H} />
          <View style={{ flexDirection: 'row', gap: G }}>
            <Tile url={show[1]} w={H} h={H} />
            <Tile url={show[2]} w={H} h={H} />
          </View>
        </View>
      )}
      {n >= 4 && (
        <View style={{ gap: G }}>
          <View style={{ flexDirection: 'row', gap: G }}>
            <Tile url={show[0]} w={H} h={H} />
            <Tile url={show[1]} w={H} h={H} />
          </View>
          <View style={{ flexDirection: 'row', gap: G }}>
            <Tile url={show[2]} w={H} h={H} />
            <Tile url={show[3]} w={H} h={H} overlay={extra > 0} extra={extra} />
          </View>
        </View>
      )}
    </View>
  );
}

function deriveStatus(orders: OrderRow[]): string {
  const statuses = orders.map(o => o.status);
  return statuses.every(s => s === statuses[0]) ? statuses[0] : 'mixed';
}

export default function Orders() {
  const { profile } = useAuth();
  const router = useRouter();
  const [checkouts, setCheckouts] = useState<CheckoutGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('id, checkout_id, order_ref, status, total_inr, created_at, store_name, order_items(quantity, pickle_image_url)')
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false });

    const rows: OrderRow[] = data || [];
    const map = new Map<string, CheckoutGroup>();

    for (const row of rows) {
      if (!map.has(row.checkout_id)) {
        map.set(row.checkout_id, {
          checkout_id: row.checkout_id,
          order_ref: row.order_ref,
          created_at: row.created_at,
          total: 0,
          lineItemCount: 0,
          images: [],
          firstStoreName: row.store_name,
          extraStoreCount: 0,
          orders: [],
        });
      }
      const g = map.get(row.checkout_id)!;
      g.total += Number(row.total_inr);
      const items = row.order_items || [];
      g.lineItemCount += items.length;
      for (const oi of items) {
        if (g.images.length < 4) g.images.push(oi.pickle_image_url ?? null);
      }
      g.orders.push(row);
    }

    for (const g of map.values()) {
      g.extraStoreCount = g.orders.length - 1;
    }

    setCheckouts(Array.from(map.values()));
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.header}>Your Orders</Text>

      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={checkouts}
          keyExtractor={(g) => g.checkout_id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No orders yet.</Text>}
          renderItem={({ item: group }) => {
            const status = deriveStatus(group.orders);
            const s = status === 'mixed'
              ? { bg: colors.surfaceTertiary, fg: colors.muted, label: 'Mixed status' }
              : (statusColors[status] || { bg: colors.surfaceTertiary, fg: colors.onSurface, label: status });

            return (
              <Pressable
                testID={`checkout-card-${group.checkout_id}`}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => router.push(`/order-detail/${group.checkout_id}`)}
              >
                <View style={styles.rowBetween}>
                  <Text style={styles.orderRef}>#{group.order_ref}</Text>
                  <View style={[styles.badge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
                  </View>
                </View>

                <View style={styles.contentRow}>
                  <View>
                    <PhotoCollage images={group.images} lineItemCount={group.lineItemCount} />
                    <Text style={styles.orderedAt}>
                      Ordered: {new Date(group.created_at).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <View style={styles.storeInfo}>
                    <View>
                      <Text style={styles.storeName} numberOfLines={2}>
                        {group.firstStoreName ?? '—'}
                      </Text>
                      {group.extraStoreCount > 0 && (
                        <Text style={styles.moreStores}>
                          + {group.extraStoreCount} more store{group.extraStoreCount > 1 ? 's' : ''}
                        </Text>
                      )}
                    </View>
                    <View style={styles.totalChevron}>
                      <Text style={styles.total}>₹{fmt(group.total)}</Text>
                      <Feather name="chevron-right" size={16} color={colors.brandPrimary} />
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, padding: spacing.xl, paddingBottom: spacing.md },

  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.sm },
  empty: { color: colors.muted, fontFamily: fonts.text, textAlign: 'center', marginTop: spacing.xl },

  card: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  cardPressed: { opacity: 0.72 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderRef: { fontFamily: fonts.textBold, fontSize: 13, color: colors.onSurface },
  orderedAt: { fontFamily: fonts.text, fontSize: 10, color: colors.muted, marginTop: 5 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.textBold, fontSize: 10, letterSpacing: 0.4 },

  contentRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },

  collage: {
    width: C, height: C,
    borderRadius: radius.sm,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: colors.surfaceTertiary,
  },
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOverlayText: { fontFamily: fonts.textBold, fontSize: 15, color: '#FFFFFF' },

  storeInfo: { flex: 1, justifyContent: 'space-between' },
  storeName: { fontFamily: fonts.textBold, fontSize: 15, color: colors.onSurface, lineHeight: 20 },
  moreStores: { fontFamily: fonts.text, fontSize: 12, color: colors.muted },

  totalChevron: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-end' },
  total: { fontFamily: fonts.textBold, fontSize: 15, color: colors.brandPrimary },
});
