import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/schema';
import { FinanceProvider, useFinance } from '@/state/finance';
import { T } from '@/ui/components';
import { AppThemeProvider, useAppTheme } from '@/ui/theme';

function Gate({ children }: { children: ReactNode }) {
  const { ready, error } = useFinance();
  const { colors: c } = useAppTheme();
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
  const navTheme = { ...base, colors: { ...base.colors, background: c.background, card: c.surface, text: c.text, border: c.border, primary: c.primary } };
  return (
    <ThemeProvider value={navTheme}>
      <FinanceProvider>
        <Gate>
          <Stack screenOptions={{ headerTintColor: c.text, headerStyle: { backgroundColor: c.surface }, headerShadowVisible: false, contentStyle: { backgroundColor: c.background } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="lancamento/novo" options={{ title: 'Novo lançamento', presentation: 'modal' }} />
            <Stack.Screen name="lancamento/[key]" options={{ title: 'Lançamento' }} />
            <Stack.Screen name="recorrencia/[id]" options={{ title: 'Recorrência' }} />
            <Stack.Screen name="contas" options={{ title: 'Contas' }} />
            <Stack.Screen name="conta/[id]" options={{ title: 'Conta', presentation: 'modal' }} />
            <Stack.Screen name="categorias" options={{ title: 'Categorias' }} />
            <Stack.Screen name="categoria/[id]" options={{ title: 'Categoria', presentation: 'modal' }} />
            <Stack.Screen name="importar" options={{ title: 'Importar do app antigo' }} />
            <Stack.Screen name="aparencia" options={{ title: 'Aparência' }} />
          </Stack>
        </Gate>
      </FinanceProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
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
