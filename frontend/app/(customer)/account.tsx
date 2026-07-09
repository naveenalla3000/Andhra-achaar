import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

export default function Account() {
  const { profile, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{profile?.full_name || 'Guest'}</Text>
          <Text style={styles.role}>{profile?.role.toUpperCase()}</Text>
        </View>
        <Pressable testID="signout-button" onPress={signOut} style={styles.signout}>
          <Text style={styles.signoutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerRow: { padding: spacing.xl, flexDirection: 'row', alignItems: 'center' },
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  role: { fontFamily: fonts.textMedium, fontSize: 11, color: colors.brandPrimary, letterSpacing: 1.5, marginTop: 2 },
  signout: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  signoutText: { fontFamily: fonts.textMedium, fontSize: 12, color: colors.onSurface },
});
