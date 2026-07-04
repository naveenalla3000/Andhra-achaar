import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const submit = async () => {
    setErr(null); setMsg(null); setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name, role: 'customer' } },
    });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    if (data.session) {
      router.replace('/');
    } else {
      setMsg('Account created. Please check your email to confirm, then sign in.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>Create Account</Text>
          <Text style={styles.tagline}>Join Venkat Ramana Pickles</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput testID="signup-name-input" style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.muted} />
            <Text style={styles.label}>Email</Text>
            <TextInput testID="signup-email-input" style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" />
            <Text style={styles.label}>Password</Text>
            <TextInput testID="signup-password-input" style={styles.input} value={password} onChangeText={setPassword} placeholder="Min 6 characters" placeholderTextColor={colors.muted} secureTextEntry />
            {err && <Text style={styles.err} testID="signup-error">{err}</Text>}
            {msg && <Text style={styles.ok} testID="signup-success">{msg}</Text>}
            <Pressable testID="signup-submit-button" onPress={submit} disabled={loading} style={[styles.btn, loading && { opacity: 0.6 }]}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Create Account</Text>}
            </Pressable>
            <Link href="/(auth)/login" asChild>
              <Pressable testID="signup-goto-login"><Text style={styles.link}>Already have an account? Sign in</Text></Pressable>
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
  brand: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface, textAlign: 'center', marginTop: spacing.xl },
  tagline: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, textAlign: 'center', marginBottom: spacing.xl },
  form: { width: '100%' },
  label: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, fontFamily: fonts.text, fontSize: 15, color: colors.onSurface },
  btn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xl, minHeight: 48, justifyContent: 'center' },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 15 },
  link: { color: colors.brandPrimary, fontFamily: fonts.textMedium, textAlign: 'center', marginTop: spacing.lg },
  err: { color: colors.error, marginTop: spacing.sm, fontFamily: fonts.text, fontSize: 13 },
  ok: { color: colors.success, marginTop: spacing.sm, fontFamily: fonts.text, fontSize: 13 },
});
