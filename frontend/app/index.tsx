import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/src/lib/auth-context';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';

export default function Index() {
  const { session, profile, loading, profileError, signOut } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;

  // Session exists but we have not been able to load a profile — bail out gracefully
  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>We couldn't load your account</Text>
        <Text style={styles.errorMessage} testID="profile-error-message">
          {profileError || 'Please try signing in again.'}
        </Text>
        <Text style={styles.errorHint}>
          Tip: The Supabase database schema and trigger fix must be applied in your project SQL editor before signup can create a profile row.
        </Text>
        <Pressable testID="profile-error-signout" onPress={signOut} style={styles.btn}>
          <Text style={styles.btnText}>Sign out & try again</Text>
        </Pressable>
      </View>
    );
  }

  if (profile.role === 'admin') return <Redirect href="/(admin)/overview" />;
  if (profile.role === 'primary_seller' || profile.role === 'sub_seller')
    return <Redirect href="/(seller)/dashboard" />;
  return <Redirect href="/(customer)/home" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  errorContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, padding: spacing.xl,
  },
  errorTitle: {
    fontFamily: fonts.display, fontSize: 20, color: colors.onSurface,
    textAlign: 'center', marginBottom: spacing.md,
  },
  errorMessage: {
    fontFamily: fonts.text, fontSize: 14, color: colors.error,
    textAlign: 'center', marginBottom: spacing.md,
  },
  errorHint: {
    fontFamily: fonts.text, fontSize: 12, color: colors.muted,
    textAlign: 'center', marginBottom: spacing.xl, lineHeight: 18,
  },
  btn: {
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md, borderRadius: radius.md, minHeight: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 14 },
});
