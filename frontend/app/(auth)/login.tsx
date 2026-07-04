import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, radius, fonts } from '@/src/lib/theme';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const submit = async () => {
    setErr(null); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Image
            source="https://images.unsplash.com/photo-1613271596363-4fb96ef16eac?w=400&q=80"
            style={styles.hero}
            contentFit="cover"
          />
          <Text style={styles.brand}>Venkat Ramana</Text>
          <Text style={styles.tagline}>Artisanal Pickles · Takeaway</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="login-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              secureTextEntry
            />
            {err && <Text style={styles.err} testID="login-error">{err}</Text>}
            <Pressable testID="login-submit-button" onPress={submit} disabled={loading} style={[styles.btn, loading && { opacity: 0.6 }]}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Sign In</Text>}
            </Pressable>
            <Link href="/(auth)/signup" asChild>
              <Pressable testID="login-goto-signup"><Text style={styles.link}>New here? Create an account</Text></Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, alignItems: 'center' },
  hero: { width: 120, height: 120, borderRadius: radius.lg, marginBottom: spacing.lg },
  brand: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface, textAlign: 'center' },
  tagline: { fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.xl },
  form: { width: '100%', maxWidth: 420 },
  label: { fontFamily: fonts.textMedium, fontSize: 13, color: colors.onSurface, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surfaceSecondary, fontFamily: fonts.text, fontSize: 15, color: colors.onSurface },
  btn: { backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xl, minHeight: 48, justifyContent: 'center' },
  btnText: { color: colors.onBrandPrimary, fontFamily: fonts.textBold, fontSize: 15 },
  link: { color: colors.brandPrimary, fontFamily: fonts.textMedium, textAlign: 'center', marginTop: spacing.lg },
  err: { color: colors.error, marginTop: spacing.sm, fontFamily: fonts.text, fontSize: 13 },
});
