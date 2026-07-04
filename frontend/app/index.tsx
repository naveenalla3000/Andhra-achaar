import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@/src/lib/auth-context';
import { colors } from '@/src/lib/theme';

export default function Index() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
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
});
