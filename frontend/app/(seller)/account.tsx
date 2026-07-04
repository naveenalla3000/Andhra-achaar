import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

export default function SellerAccount() {
  const { profile, signOut } = useAuth();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.body}>
        <Text style={styles.name}>{profile?.full_name || '—'}</Text>
        <Text style={styles.role}>{profile?.role.replace('_', ' ').toUpperCase()}</Text>
        <View style={styles.card}>
          <Text style={styles.k}>Store</Text>
          <Text style={styles.v}>{profile?.store_id ? profile.store_id : 'Not assigned'}</Text>
        </View>
        <Pressable testID="signout-button" onPress={signOut} style={styles.signout}><Text style={styles.signoutText}>Sign out</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.xl },
  name: { fontFamily: fonts.display, fontSize: 24, color: colors.onSurface },
  role: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.brandPrimary, letterSpacing: 1.5, marginTop: 2 },
  card: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  k: { fontFamily: fonts.text, color: colors.muted, fontSize: 12 },
  v: { fontFamily: fonts.textBold, color: colors.onSurface, marginTop: 4 },
  signout: { marginTop: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  signoutText: { fontFamily: fonts.textMedium, color: colors.onSurface },
});
