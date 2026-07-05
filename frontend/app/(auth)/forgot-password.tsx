import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setMsg(null); setLoading(true);
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL as string;
    const redirectTo = `${backendUrl}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setMsg('If that email is registered, a reset link has been sent. Please check your inbox and spam folder.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>Enter the email you signed up with, we'll send you a reset link.</Text>
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="forgot-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {err && <Text style={styles.err} testID="forgot-error">{err}</Text>}
            {msg && <Text style={styles.ok} testID="forgot-success">{msg}</Text>}
            <Pressable testID="forgot-submit-button" onPress={submit} disabled={loading} style={[styles.btn, loading && { opacity: 0.6 }]}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Send reset link</Text>}
            </Pressable>
            <Link href="/(auth)/login" asChild>
              <Pressable testID="forgot-goto-login"><Text style={styles.link}>Back to sign in</Text></Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface, textAlign: 'center', marginTop: spacing.xl },
  subtitle: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: spacing.xl, marginTop: spacing.sm },
  form: { width: '100%' },
  label: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, fontFamily: fonts.text, fontSize: 15, color: colors.onSurface },
  btn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xl, minHeight: 48, justifyContent: 'center' },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 15 },
  link: { color: colors.brandPrimary, fontFamily: fonts.textMedium, textAlign: 'center', marginTop: spacing.lg },
  err: { color: colors.error, marginTop: spacing.sm, fontFamily: fonts.text, fontSize: 13 },
  ok: { color: colors.success, marginTop: spacing.sm, fontFamily: fonts.text, fontSize: 13 },
});
