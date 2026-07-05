import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type AppRole = 'admin' | 'primary_seller' | 'sub_seller' | 'customer';
export interface Profile {
  id: string;
  supabase_id: string;
  full_name: string | null;
  phone: string | null;
  role: AppRole;
  store_id: string | null;
}

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null, profile: null, loading: true, profileError: null,
  refreshProfile: async () => {}, signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadProfile = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('supabase_id', uid)
        .maybeSingle();
      if (error) {
        setProfile(null);
        setProfileError(error.message);
        return;
      }
      if (!data) {
        // Self-heal: profile row was deleted but auth.users still exists.
        // Recreate it (RLS allows this because supabase_id = auth.uid()).
        const { data: userData } = await supabase.auth.getUser();
        const email = userData?.user?.email ?? null;
        const { data: healed, error: healErr } = await supabase
          .from('user_profiles')
          .insert({ supabase_id: uid, full_name: email, role: 'customer' })
          .select('*')
          .maybeSingle();
        if (healErr || !healed) {
          setProfile(null);
          setProfileError(
            healErr?.message ||
            'No profile found. The database schema may not be applied yet.'
          );
          return;
        }
        setProfile(healed as Profile);
        setProfileError(null);
        return;
      }
      setProfile(data as Profile);
      setProfileError(null);
    } catch (e: any) {
      setProfile(null);
      setProfileError(e?.message || 'Failed to load profile');
    }
  };

  const refreshProfile = async () => {
    if (session?.user?.id) await loadProfile(session.user.id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s?.user?.id) await loadProfile(s.user.id);
      else setProfile(null);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => {
    // Fire-and-forget: don't let a slow network call block navigation
    supabase.auth.signOut().catch(() => {});
    // Purge any lingering Supabase session tokens from AsyncStorage
    try {
      const keys = await AsyncStorage.getAllKeys();
      const supabaseKeys = keys.filter((k) => k.startsWith('sb-') || k.includes('supabase'));
      if (supabaseKeys.length) await AsyncStorage.multiRemove(supabaseKeys);
    } catch {
      // ignore
    }
    setSession(null);
    setProfile(null);
    setProfileError(null);
    router.replace('/(auth)/login');
  };

  return <Ctx.Provider value={{ session, profile, loading, profileError, refreshProfile, signOut }}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);
