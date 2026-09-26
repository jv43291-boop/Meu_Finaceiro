import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useCloud } from '@/state/cloud';
import { OFFSET_WARN_MS } from '@/sync/clock';
import { useFinance } from '@/state/finance';
import { Button, Card, Field, Icon, Input, Pill, Screen, Segmented, T } from '@/ui/components';
import { confirmAsk, notify } from '@/ui/dialogs';
import { space, useColors } from '@/ui/theme';

function since(iso: string | null): string {
  if (!iso) return 'ainda não sincronizado';
  const diff = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (diff < 1) return 'sincronizado agora';
  if (diff < 60) return `sincronizado há ${diff} min`;
  const h = Math.round(diff / 60);
  if (h < 24) return `sincronizado há ${h} h`;
  return `sincronizado em ${new Date(iso).toLocaleDateString('pt-BR')}`;
}

function skewLabel(ms: number): string {
  const min = Math.round(Math.abs(ms) / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  if (h >= 48) return `${Math.round(h / 24)} dias`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export default function CloudScreen() {
  const c = useColors();
  const cloud = useCloud();
  const { importOldApp } = useFinance();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!cloud.configured) {
    return (
      <Screen>
        <Card>
          <T variant="heading">Nuvem ainda não configurada</T>
          <T variant="caption">
            Para ativar a sincronização, copie o arquivo .env.example para .env na pasta do projeto, cole a chave publishable
            do Supabase em EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY e reinicie o npx expo start.
          </T>
        </Card>
      </Screen>
    );
  }

  async function submit() {
    if (!email.includes('@') || password.length < 6) {
      return notify('Revise os dados', 'Informe um e-mail válido e uma senha com pelo menos 6 caracteres.');
    }
    setBusy(true);
    try {
      if (mode === 'in') await cloud.signIn(email, password);
      else {
        const r = await cloud.signUp(email, password);
        if (r.needsConfirmation) await notify('Conta criada', 'Abra o link de confirmação enviado para o seu e-mail e depois toque em Entrar.');
      }
      setPassword('');
    } catch (e) {
      await notify('Não foi possível continuar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importLegacy() {
    const ok = await confirmAsk('Importar backup antigo?', 'Os lançamentos do Meu Financeiro 1.0 serão somados aos que já estão aqui. Faça isso uma vez só.', 'Importar');
    if (!ok) return;
    try {
      const r = await importOldApp(cloud.legacyBackup);
      await cloud.dismissLegacy();
      await notify('Importação concluída', `${r.stats.recurrences} recorrência(s) e ${r.stats.transactions} lançamento(s) trazidos do app antigo.`);
    } catch (e) {
      await notify('Não foi possível importar', e instanceof Error ? e.message : String(e));
    }
  }

  if (!cloud.session) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
          <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cloud-sync-outline" size={32} color={c.primaryText} />
          </View>
          <T variant="heading">Guarde seus dados na nuvem</T>
          <T variant="caption" style={{ textAlign: 'center' }}>
            O app continua funcionando sem internet. Com a conta, tudo sincroniza sozinho e você pode usar em outro celular.
          </T>
        </View>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'in', label: 'Entrar' }, { value: 'up', label: 'Criar conta' }]} />
        <Field label="E-mail">
          <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        </Field>
        <Field label="Senha" hint={mode === 'up' ? 'Pelo menos 6 caracteres.' : undefined}>
          <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'in' ? 'current-password' : 'new-password'} textContentType={mode === 'in' ? 'password' : 'newPassword'} />
        </Field>
        <Button title={mode === 'in' ? 'Entrar' : 'Criar conta'} icon="login" onPress={submit} disabled={busy} />
        <T variant="caption" style={{ textAlign: 'center' }}>
          Ao entrar pela primeira vez, os dados que já estão neste celular sobem para a conta.
        </T>
      </Screen>
    );
  }

  const statusLabel = cloud.status === 'syncing' ? 'sincronizando…' : cloud.status === 'error' ? 'erro na última tentativa' : since(cloud.lastSyncAt);

  return (
    <Screen>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            {cloud.status === 'syncing' ? <ActivityIndicator color={c.primaryText} /> : <Icon name={cloud.status === 'error' ? 'cloud-alert-outline' : 'cloud-check-outline'} color={cloud.status === 'error' ? c.warning : c.primaryText} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="bodyStrong" numberOfLines={1}>{cloud.email}</T>
            <T variant="caption">{statusLabel}</T>
          </View>
        </View>
        {cloud.lastError ? <T variant="caption" color={c.warning}>{cloud.lastError}</T> : null}
        <Button title="Sincronizar agora" icon="sync" variant="secondary" onPress={() => cloud.syncNow()} disabled={cloud.status === 'syncing'} />
        <T variant="caption">A sincronização também acontece sozinha: ao abrir o app, alguns segundos depois de cada alteração e a cada 5 minutos.</T>
      </Card>

      {cloud.clockSkewMs !== null && Math.abs(cloud.clockSkewMs) >= OFFSET_WARN_MS ? (
        <Card style={{ borderWidth: 1.5, borderColor: c.warning }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="clock-alert-outline" color={c.warning} />
            <T variant="bodyStrong" color={c.warning}>Relógio do celular {cloud.clockSkewMs > 0 ? 'adiantado' : 'atrasado'} {skewLabel(cloud.clockSkewMs)}</T>
          </View>
          <T variant="caption">
            A sincronização já corrige isso sozinha, mas “hoje”, atrasados, lembretes e a fatura aberta usam o relógio do celular. Ative “Data e hora automáticas” nas configurações do celular.
          </T>
        </Card>
      ) : null}

      {cloud.legacyBackup ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T variant="heading">Backup do app antigo</T>
            <Pill tone="primary" label="encontrado" />
          </View>
          <T variant="caption">Esta conta tem um backup do Meu Financeiro 1.0. Quer trazer esses lançamentos para o Live?</T>
          <Button title="Importar agora" icon="database-import-outline" onPress={importLegacy} />
          <Button title="Agora não" variant="ghost" onPress={() => cloud.dismissLegacy()} />
        </Card>
      ) : null}

      <Button
        title="Sair da conta"
        variant="danger"
        icon="logout"
        onPress={async () => {
          const ok = await confirmAsk('Sair da conta?', 'Seus dados ficam guardados na nuvem e são apagados deste celular. Ao entrar de novo, eles voltam.', 'Sair', true);
          if (!ok) return;
          const r = await cloud.signOut();
          if (!r.done) {
            const force = await confirmAsk(
              'Há alterações não enviadas',
              `${r.pending === 1 ? '1 alteração ainda não foi enviada' : `${r.pending} alterações ainda não foram enviadas`} para a nuvem (sem internet?). Se sair agora, elas se perdem.`,
              'Sair mesmo assim',
              true,
            );
            if (force) await cloud.signOut({ force: true });
          }
        }}
      />
    </Screen>
  );
}
