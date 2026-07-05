import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Supabase-js parses the URL hash on load; PASSWORD_RECOVERY event fires
    // when the recovery token was consumed and a temporary session is set.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasRecovery(true);
    });
    // Also check if the session is already set (page refresh scenarios)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasRecovery(true);
    });
    return () => { data.subscription.unsubscribe(); };
  }, []);

  const submit = async () => {
    setErr(null); setMsg(null);
    if (password.length < 6) { setErr('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setErr('Passwords do not match'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setMsg('Password updated. Redirecting to sign in…');
    // Sign out to force fresh login with new password
    setTimeout(async () => {
      await supabase.auth.signOut();
      router.replace('/(auth)/login');
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Reset Password</Text>
          {!hasRecovery ? (
            <>
              <Text style={styles.subtitle}>
                Waiting for a valid recovery link… If you arrived here directly, please open the reset link from your email.
              </Text>
              <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
              <Link href="/(auth)/login" asChild>
                <Pressable testID="reset-goto-login"><Text style={styles.link}>Back to sign in</Text></Pressable>
              </Link>
            </>
          ) : (
            <View style={styles.form}>
              <Text style={styles.subtitle}>Choose a new password for your account.</Text>
              <Text style={styles.label}>New password</Text>
              <TextInput
                testID="reset-new-password"
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Min 6 characters"
                placeholderTextColor={colors.muted}
                secureTextEntry
              />
              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                testID="reset-confirm-password"
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Repeat"
                placeholderTextColor={colors.muted}
                secureTextEntry
              />
              {err && <Text style={styles.err} testID="reset-error">{err}</Text>}
              {msg && <Text style={styles.ok} testID="reset-success">{msg}</Text>}
              <Pressable testID="reset-submit-button" onPress={submit} disabled={loading} style={[styles.btn, loading && { opacity: 0.6 }]}>
                {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Update password</Text>}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface, textAlign: 'center', marginTop: spacing.xl },
  subtitle: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: spacing.xl, marginTop: spacing.sm, lineHeight: 20 },
  form: { width: '100%' },
  label: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, fontFamily: fonts.text, fontSize: 15, color: colors.onSurface },
  btn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xl, minHeight: 48, justifyContent: 'center' },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 15 },
  link: { color: colors.brandPrimary, fontFamily: fonts.textMedium, textAlign: 'center', marginTop: spacing.lg },
  err: { color: colors.error, marginTop: spacing.sm, fontFamily: fonts.text, fontSize: 13 },
  ok: { color: colors.success, marginTop: spacing.sm, fontFamily: fonts.text, fontSize: 13 },
});
