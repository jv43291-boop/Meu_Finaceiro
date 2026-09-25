import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/schema';
import { CloudProvider } from '@/state/cloud';
import { FinanceProvider, useFinance } from '@/state/finance';
import { T } from '@/ui/components';
import { AppThemeProvider, fonts, useAppTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Gate({ children }: { children: ReactNode }) {
  const { ready, error } = useFinance();
  const { colors: c } = useAppTheme();
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: c.background }}>
        <T variant="heading">Não foi possível abrir seus dados</T>
        <T variant="caption">{error}</T>
      </View>
    );
  }
  return <>{children}</>;
}

function ThemedApp() {
  const { scheme, colors: c } = useAppTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: c.canvas, card: c.surface, text: c.text, border: c.border, primary: c.primary } };
  return (
    <ThemeProvider value={navTheme}>
      <FinanceProvider>
        <CloudProvider>
        <Gate>
          <Stack screenOptions={{ headerTintColor: c.text, headerStyle: { backgroundColor: c.background }, headerTitleStyle: { fontFamily: fonts.extrabold, fontSize: 17 }, headerShadowVisible: false, contentStyle: { backgroundColor: c.canvas } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="lancamento/novo" options={{ title: 'Novo lançamento', presentation: 'modal' }} />
            <Stack.Screen name="lancamento/[key]" options={{ title: 'Lançamento' }} />
            <Stack.Screen name="recorrencia/[id]" options={{ title: 'Recorrência' }} />
            <Stack.Screen name="contas" options={{ title: 'Contas' }} />
            <Stack.Screen name="conta/[id]" options={{ title: 'Conta', presentation: 'modal' }} />
            <Stack.Screen name="categorias" options={{ title: 'Categorias' }} />
            <Stack.Screen name="categoria/[id]" options={{ title: 'Categoria', presentation: 'modal' }} />
            <Stack.Screen name="importar" options={{ title: 'Importar do app antigo' }} />
            <Stack.Screen name="aparencia" options={{ title: 'Personalizar' }} />
            <Stack.Screen name="nuvem" options={{ title: 'Conta e sincronização' }} />
          </Stack>
        </Gate>
        </CloudProvider>
      </FinanceProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  // sem fonte (erro raro), segue com a fonte do sistema em vez de travar na abertura
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
        <AppThemeProvider>
          <ThemedApp />
        </AppThemeProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
