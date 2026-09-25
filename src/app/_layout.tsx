import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/schema';
import { FinanceProvider, useFinance } from '@/state/finance';
import { T } from '@/ui/components';
import { useColors } from '@/ui/theme';

function Gate({ children }: { children: React.ReactNode }) {
  const { ready, error } = useFinance();
  const c = useColors();
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

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.background, card: c.surface, text: c.text, border: c.border, primary: c.primary } };

  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
          <FinanceProvider>
            <Gate>
              <Stack screenOptions={{ headerTintColor: c.text, headerStyle: { backgroundColor: c.surface }, headerShadowVisible: false }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="lancamento/novo" options={{ title: 'Novo lançamento', presentation: 'modal' }} />
                <Stack.Screen name="lancamento/[key]" options={{ title: 'Lançamento' }} />
                <Stack.Screen name="recorrencia/[id]" options={{ title: 'Recorrência' }} />
                <Stack.Screen name="contas" options={{ title: 'Contas' }} />
                <Stack.Screen name="conta/[id]" options={{ title: 'Conta', presentation: 'modal' }} />
                <Stack.Screen name="categorias" options={{ title: 'Categorias' }} />
                <Stack.Screen name="categoria/[id]" options={{ title: 'Categoria', presentation: 'modal' }} />
                <Stack.Screen name="importar" options={{ title: 'Importar do app antigo' }} />
              </Stack>
            </Gate>
          </FinanceProvider>
        </SQLiteProvider>
      </ThemeProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
