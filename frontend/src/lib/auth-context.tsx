import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
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
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null, profile: null, loading: true,
  refreshProfile: async () => {}, signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadProfile = async (uid: string) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('supabase_id', uid)
      .maybeSingle();
    setProfile(data as Profile | null);
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
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore network errors — always clear local state
    }
    setSession(null);
    setProfile(null);
    router.replace('/(auth)/login');
  };

  return <Ctx.Provider value={{ session, profile, loading, refreshProfile, signOut }}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);
