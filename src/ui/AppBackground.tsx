import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { backgroundExists } from './backgroundImage';
import { DIM_ALPHA, useAppTheme } from './theme';

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Foto de fundo do app, sempre atrás de tudo.
 * - "cover": preenche a tela em qualquer proporção, cortando o excesso (nunca distorce).
 * - Um véu na cor do tema por cima garante que textos e cartões continuem legíveis.
 * - Se o arquivo sumir ou falhar ao carregar, o app volta ao fundo normal.
 */
export function AppBackground() {
  const { background, colors } = useAppTheme();
  const uri = background.uri;
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const missing = useMemo(() => !backgroundExists(uri), [uri]);
  const failed = missing || failedUri === uri;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
      {uri && !failed ? (
        <>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="center"
            blurRadius={background.blur ? 18 : 0}
            transition={200}
            onError={() => setFailedUri(uri)}
            accessible={false}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.background, DIM_ALPHA[background.dim]) }]} />
        </>
      ) : null}
    </View>
  );
}
