import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { pickBackground, removeBackground } from '@/ui/backgroundImage';
import { Button, Card, Icon, ListRow, Screen, Segmented, SwitchRow, T } from '@/ui/components';
import { notify } from '@/ui/dialogs';
import { ACCENTS, DIM_ALPHA, space, useAppTheme, useColors, type AccentName, type BackgroundDim, type ThemePreference } from '@/ui/theme';

const OPTIONS: { value: ThemePreference; label: string; hint: string; icon: string }[] = [
  { value: 'system', label: 'Automático', hint: 'Segue o tema do celular', icon: 'theme-light-dark' },
  { value: 'light', label: 'Claro', hint: 'Sempre claro', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Escuro', hint: 'Sempre escuro, melhor à noite', icon: 'weather-night' },
];

export default function PersonalizeScreen() {
  const c = useColors();
  const { preference, setPreference, accent, setAccent, background, setBackground, scheme } = useAppTheme();
  const [busy, setBusy] = useState(false);

  async function choosePhoto() {
    setBusy(true);
    try {
      const uri = await pickBackground(background.uri);
      if (uri) setBackground({ ...background, uri });
    } catch (e) {
      await notify('Não foi possível usar essa foto', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function clearPhoto() {
    removeBackground(background.uri);
    setBackground({ ...background, uri: null });
  }

  return (
    <Screen>
      <Card>
        <T variant="label">Prévia</T>
        <View style={{ alignItems: 'center' }}>
          <Preview />
        </View>
      </Card>

      <Card>
        <T variant="label">Foto de fundo</T>
        <T variant="caption">
          A foto preenche a tela sem distorcer, em qualquer celular. Um véu na cor do tema fica por cima para os textos continuarem legíveis.
        </T>
        <Button title={background.uri ? 'Trocar foto' : 'Escolher da galeria'} icon="image-outline" onPress={choosePhoto} disabled={busy} />
        {busy ? <ActivityIndicator color={c.primary} /> : null}
        {background.uri ? (
          <>
            <T variant="caption" weight="bold">Intensidade do véu</T>
            <Segmented<BackgroundDim>
              value={background.dim}
              onChange={(dim) => setBackground({ ...background, dim })}
              options={[{ value: 'soft', label: 'Suave' }, { value: 'medium', label: 'Médio' }, { value: 'strong', label: 'Forte' }]}
            />
            <SwitchRow title="Desfocar a foto" subtitle="Deixa o fundo mais discreto." value={background.blur} onChange={(blur) => setBackground({ ...background, blur })} />
            <Button title="Remover foto" variant="danger" icon="image-remove" onPress={clearPhoto} />
          </>
        ) : null}
      </Card>

      <Card>
        <T variant="label">Cor de destaque</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {(Object.keys(ACCENTS) as AccentName[]).map((name) => {
            const sel = name === accent;
            const color = ACCENTS[name][scheme].primary;
            return (
              <Pressable key={name} accessibilityRole="radio" accessibilityState={{ selected: sel }} accessibilityLabel={ACCENTS[name].label} onPress={() => setAccent(name)} style={{ alignItems: 'center', gap: 6, width: 56 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: color, alignItems: 'center', justifyContent: 'center', borderWidth: sel ? 3 : 0, borderColor: c.text }}>
                  {sel ? <Icon name="check" color="#FFFFFF" /> : null}
                </View>
                <T variant="caption" weight={sel ? 'bold' : 'medium'} color={sel ? c.text : undefined}>{ACCENTS[name].label}</T>
              </Pressable>
            );
          })}
        </View>
        <T variant="caption">O ícone do app na tela do celular continua violeta.</T>
      </Card>

      <Card>
        <T variant="label">Tema</T>
        <View accessibilityRole="radiogroup">
          {OPTIONS.map((o) => {
            const selected = preference === o.value;
            return (
              <ListRow
                key={o.value}
                icon={o.icon}
                title={o.label}
                subtitle={o.hint}
                onPress={() => setPreference(o.value)}
                right={<Icon name={selected ? 'radiobox-marked' : 'radiobox-blank'} color={selected ? c.primary : c.muted} />}
              />
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

/** Miniatura da tela inicial com o fundo, o véu e a cor escolhidos. */
function Preview() {
  const c = useColors();
  const { background } = useAppTheme();
  const veil = c.background + Math.round(DIM_ALPHA[background.dim] * 255).toString(16).padStart(2, '0');
  return (
    <View style={{ width: 170, height: 300, borderRadius: 26, overflow: 'hidden', backgroundColor: c.background, borderWidth: 1, borderColor: c.border }}>
      {background.uri ? (
        <>
          <Image source={{ uri: background.uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={background.blur ? 8 : 0} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: veil }]} />
        </>
      ) : null}
      <View style={{ padding: 12, gap: 8 }}>
        <T variant="bodyStrong">Live</T>
        <View style={{ backgroundColor: c.hero, borderRadius: 14, padding: 10, gap: 4 }}>
          <View style={{ width: 50, height: 5, borderRadius: 3, backgroundColor: c.heroMuted }} />
          <View style={{ width: 90, height: 12, borderRadius: 4, backgroundColor: c.onHero }} />
          <View style={{ width: 60, height: 7, borderRadius: 4, backgroundColor: c.spark }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ flex: 1, height: 36, borderRadius: 10, backgroundColor: c.surface }} />
          <View style={{ flex: 1, height: 36, borderRadius: 10, backgroundColor: c.surface }} />
        </View>
        <View style={{ height: 110, borderRadius: 12, backgroundColor: c.surface, padding: 8, gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <View style={{ width: 18, height: 18, borderRadius: 6, backgroundColor: c.primarySoft }} />
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.border }} />
              <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: c.muted }} />
            </View>
          ))}
        </View>
      </View>
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, backgroundColor: c.surface, alignItems: 'center' }}>
        <View style={{ width: 26, height: 26, marginTop: -10, borderRadius: 9, backgroundColor: c.primary }} />
      </View>
    </View>
  );
}

