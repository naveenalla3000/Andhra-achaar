import { Tabs, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '@/src/lib/theme';
import { useAuth } from '@/src/lib/auth-context';

export default function CustomerTabs() {
  const { session, loading } = useAuth();
  if (!loading && !session) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brandPrimary,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, height: 64, paddingBottom: 8, paddingTop: 6 },
      tabBarLabelStyle: { fontFamily: fonts.textMedium, fontSize: 11 },
    }}>
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }} />
    </Tabs>
  );
}
