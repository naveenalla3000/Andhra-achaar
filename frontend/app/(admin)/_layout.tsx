import { Tabs, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '@/src/lib/theme';
import { useAuth } from '@/src/lib/auth-context';

export default function AdminTabs() {
  const { session, profile, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/(auth)/login" />;
  if (!loading && profile && profile.role !== 'admin') return <Redirect href="/" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brandPrimary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 6 },
      tabBarLabelStyle: { fontFamily: fonts.textMedium, fontSize: 11 },
    }}>
      <Tabs.Screen name="overview" options={{ title: 'Overview', tabBarIcon: ({ color, size }) => <Feather name="pie-chart" size={size} color={color} /> }} />
      <Tabs.Screen name="stores" options={{ title: 'Stores', tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="curation" options={{ title: 'Curation', tabBarIcon: ({ color, size }) => <Feather name="layout" size={size} color={color} /> }} />
      <Tabs.Screen name="users" options={{ title: 'Users', tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }} />
    </Tabs>
  );
}
