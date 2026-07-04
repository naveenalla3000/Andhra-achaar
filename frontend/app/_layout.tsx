import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { LogBox } from 'react-native';
import * as Font from 'expo-font';
import { useState } from 'react';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider } from '@/src/lib/auth-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

const CUSTOM_FONTS = {
  LibreBaskerville_400Regular: 'https://fonts.gstatic.com/s/librebaskerville/v14/kmKnZrc3Hgbbcjq75U4uslyuy4kn0pNe.ttf',
  LibreBaskerville_700Bold: 'https://fonts.gstatic.com/s/librebaskerville/v14/kmKiZrc3Hgbbcjq75U4uslyuy4kn0qNcaxYaDc0.ttf',
  PlusJakartaSans_400Regular: 'https://fonts.gstatic.com/s/plusjakartasans/v8/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_qU79TFEz.ttf',
  PlusJakartaSans_500Medium: 'https://fonts.gstatic.com/s/plusjakartasans/v8/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_qUf-TFEz.ttf',
  PlusJakartaSans_700Bold: 'https://fonts.gstatic.com/s/plusjakartasans/v8/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_qXn5TFEz.ttf',
};

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync(CUSTOM_FONTS as any);
      } catch {}
      setFontsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if ((iconsLoaded || iconsError) && fontsLoaded) SplashScreen.hideAsync();
  }, [iconsLoaded, iconsError, fontsLoaded]);

  if (!iconsLoaded && !iconsError) return null;
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
