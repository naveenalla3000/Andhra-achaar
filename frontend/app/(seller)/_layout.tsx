import { Tabs, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '@/src/lib/theme';
import { useAuth } from '@/src/lib/auth-context';

export default function SellerTabs() {
  const { session, profile, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/(auth)/login" />;
  if (!loading && profile && profile.role !== 'primary_seller' && profile.role !== 'sub_seller') return <Redirect href="/" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brandPrimary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 6 },
      tabBarLabelStyle: { fontFamily: fonts.textMedium, fontSize: 11 },
    }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: ({ color, size }) => <Feather name="package" size={size} color={color} /> }} />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: ({ color, size }) => <Feather name="box" size={size} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }} />
    </Tabs>
  );
}
