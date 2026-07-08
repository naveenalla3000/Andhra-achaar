import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/src/lib/auth-context';
import { colors } from '@/src/lib/theme';

export default function Index() {
  const { session, profile, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && session && !profile) {
      Alert.alert(
        'Account not found',
        'No account exists for this login. Please create an account.',
        [{ text: 'OK', onPress: signOut }],
      );
    }
  }, [loading, session, profile]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;

  if (!profile) return null;

  if (profile.role === 'admin') return <Redirect href="/(admin)/overview" />;
  if (profile.role === 'primary_seller' || profile.role === 'sub_seller')
    return <Redirect href="/(seller)/dashboard" />;
  return <Redirect href="/(customer)/home" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
});
