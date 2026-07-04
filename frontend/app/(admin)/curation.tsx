import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

export default function Curation() {
  const [sections, setSections] = useState<any[]>([]);
  const [pickles, setPickles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: secs } = await supabase.from('home_sections').select('id,title,sort_order,home_section_items(id,pickle_id,sort_order,pickle:pickles(id,name))').order('sort_order');
    setSections(secs || []);
    const { data: pk } = await supabase.from('pickles').select('id,name').eq('is_active', true).order('name');
    setPickles(pk || []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addSection = async () => {
    const title = 'New Section';
    const nextOrder = (sections[sections.length - 1]?.sort_order ?? 0) + 1;
    const { error } = await supabase.from('home_sections').insert({ title, sort_order: nextOrder });
    if (error) Alert.alert('Error', error.message); load();
  };
  const delSection = async (id: string) => {
    await supabase.from('home_sections').delete().eq('id', id); load();
  };
  const toggleItem = async (sectionId: string, pickleId: string, existingId?: string) => {
    if (existingId) await supabase.from('home_section_items').delete().eq('id', existingId);
    else await supabase.from('home_section_items').insert({ section_id: sectionId, pickle_id: pickleId, sort_order: 0 });
    load();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Homepage Curation</Text>
        <Pressable testID="add-section" onPress={addSection} style={styles.addBtn}><Feather name="plus" size={18} color={colors.onBrandPrimary} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, paddingBottom: spacing.xxxl }}>
        {sections.map(sec => (
          <View key={sec.id} style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>{sec.title}</Text>
              <Pressable testID={`del-section-${sec.id}`} onPress={() => delSection(sec.id)}><Feather name="trash-2" size={16} color={colors.error} /></Pressable>
            </View>
            <Text style={styles.hint}>Tap pickles below to add/remove from this section</Text>
            <View style={styles.chips}>
              {pickles.map(p => {
                const item = sec.home_section_items?.find((si: any) => si.pickle_id === p.id);
                const active = !!item;
                return (
                  <Pressable key={p.id} testID={`toggle-${sec.id}-${p.id}`} onPress={() => toggleItem(sec.id, p.id, item?.id)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.name}</Text>
                    {active && <Feather name="check" size={12} color={colors.onBrandPrimary} />}
                  </Pressable>
                );
              })}
              {pickles.length === 0 && <Text style={styles.empty}>No active pickles yet.</Text>}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, paddingBottom: spacing.md },
  header: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' },
  section: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface },
  hint: { fontFamily: fonts.text, fontSize: 11, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurface },
  chipTextActive: { color: colors.onBrandPrimary },
  empty: { fontFamily: fonts.text, color: colors.muted },
});
