import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Share, View } from 'react-native';

import { sqliteHealth, type SqliteHealth } from '@/db/diagnostics';
import { buildDiagnosticReport, maskEmail } from '@/domain/diagnosticReport';
import { checkIntegrity, type IntegrityIssue } from '@/domain/integrity';
import { useCloud } from '@/state/cloud';
import { useFinance } from '@/state/finance';
import { pingSupabase } from '@/sync/supabase';
import { Button, Card, Icon, Screen, T } from '@/ui/components';
import { notify } from '@/ui/dialogs';
import { space, useColors } from '@/ui/theme';

const TABLE_LABEL: Record<string, string> = {
  accounts: 'Contas', categories: 'Categorias', credit_cards: 'Cartões', goals: 'Metas',
  payee_rules: 'Regras de recebedor', recurrences: 'Fixos', transactions: 'Lançamentos',
};

function Status({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  const c = useColors();
  const color = ok === null ? c.muted : ok ? c.income : c.danger;
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: 4 }}>
      <Icon name={ok === null ? 'help-circle-outline' : ok ? 'check-circle-outline' : 'close-circle-outline'} size={22} color={color} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{label}</T>
        <T variant="caption">{detail}</T>
      </View>
    </View>
  );
}

/** Área técnica: estado do banco, da conta, do Supabase e da sincronização. Não mostra valores. */
export default function DiagnosticsScreen() {
  const db = useSQLiteContext();
  const f = useFinance();
  const cloud = useCloud();
  const c = useColors();
  const [health, setHealth] = useState<SqliteHealth | null>(null);
  const [ping, setPing] = useState<{ ok: boolean; ms: number | null; status: number | null } | null>(null);
  const [issues, setIssues] = useState<IntegrityIssue[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [h, p] = await Promise.all([sqliteHealth(db), pingSupabase()]);
      setHealth(h);
      setPing(p);
    } catch (e) {
      await notify('Falha no diagnóstico', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [db]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  function revalidate() {
    setIssues(checkIntegrity(f));
  }

  async function share() {
    const text = buildDiagnosticReport({
      generatedAt: new Date().toISOString(),
      app: {
        version: Constants.expoConfig?.version ?? '?',
        runtime: Updates.runtimeVersion ?? null,
        channel: Updates.channel ?? null,
        updateId: Updates.updateId ?? null,
        embedded: Updates.isEmbeddedLaunch,
        platform: Platform.OS,
      },
      sqlite: health ?? { ok: false, check: 'não medido', schemaVersion: 0, tables: [], quarantined: 0 },
      auth: { configured: cloud.configured, signedIn: !!cloud.session, email: cloud.email },
      supabase: ping,
      sync: { status: cloud.status, lastSyncAt: cloud.lastSyncAt, pending: cloud.pending, rejected: cloud.rejected.length, nextRetryAt: cloud.nextRetryAt, clockSkewMs: cloud.clockSkewMs },
      issues: issues ?? checkIntegrity(f),
    });
    try {
      await Share.share({ message: text });
    } catch {
      await notify('Não foi possível compartilhar');
    }
  }

  const totals = health?.tables ?? [];
  return (
    <Screen>
      <Card>
        <T variant="caption">Área técnica para investigar problemas. Nada aqui mostra valores ou descrições dos seus lançamentos.</T>
        {busy ? <ActivityIndicator color={c.primary} /> : null}
      </Card>

      <Card style={{ gap: space.sm }}>
        <T variant="label">Estado</T>
        <Status ok={health ? health.ok : null} label="Banco no celular (SQLite)" detail={health ? `${health.ok ? 'Íntegro' : `Problema: ${health.check}`} · versão ${health.schemaVersion}` : 'Verificando…'} />
        <Status
          ok={cloud.configured ? !!cloud.session : null}
          label="Conta"
          detail={!cloud.configured ? 'Nuvem não configurada neste app' : cloud.session ? `Conectado como ${maskEmail(cloud.email)}` : 'Não conectado'}
        />
        <Status
          ok={!cloud.configured || !ping ? null : ping.ok}
          label="Supabase"
          detail={!cloud.configured ? 'Não configurado neste app (.env)' : !ping ? 'Testando…' : ping.ok ? `Respondendo (${ping.ms} ms)` : ping.status ? `Respondeu com erro ${ping.status}` : 'Sem resposta (sem internet?)'}
        />
        <Status
          ok={cloud.status === 'error' || cloud.rejected.length ? false : cloud.status === 'off' ? null : true}
          label="Sincronização"
          detail={`${cloud.status} · última ${cloud.lastSyncAt ? new Date(cloud.lastSyncAt).toLocaleString('pt-BR') : 'nunca'} · ${cloud.pending} pendente(s) · ${cloud.rejected.length} recusado(s)${cloud.nextRetryAt ? ` · nova tentativa ${new Date(cloud.nextRetryAt).toLocaleTimeString('pt-BR')}` : ''}`}
        />
        {cloud.clockSkewMs !== null ? (
          <Status ok={Math.abs(cloud.clockSkewMs) < 120_000} label="Relógio do celular" detail={`${Math.round(cloud.clockSkewMs / 1000)} s de diferença para o servidor`} />
        ) : null}
      </Card>

      <Card style={{ gap: 4 }}>
        <T variant="label">Registros no celular</T>
        {totals.map((t) => (
          <View key={t.table} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
            <T variant="body">{TABLE_LABEL[t.table] ?? t.table}</T>
            <T variant="caption">{t.total} · {t.deleted} excluídos · {t.pending} pendentes</T>
          </View>
        ))}
        {health ? <T variant="caption">Na quarentena da sincronização: {health.quarantined}</T> : null}
      </Card>

      <Card style={{ gap: space.sm }}>
        <T variant="label">Integridade dos dados</T>
        {issues === null ? (
          <T variant="caption">Procura referências quebradas, duplicados e valores inválidos. Só mostra — não corrige nada sozinho.</T>
        ) : issues.length === 0 ? (
          <Status ok label="Nenhum problema encontrado" detail={`${f.transactions.length} lançamentos e ${f.recurrences.length} fixos verificados.`} />
        ) : (
          issues.map((i) => <Status key={i.code} ok={false} label={i.label} detail={`${i.count} registro(s) · código ${i.code}`} />)
        )}
      </Card>

      <Button title="Revalidar integridade" icon="shield-check-outline" variant="secondary" onPress={revalidate} />
      <Button title="Sincronizar agora" icon="sync" variant="secondary" onPress={() => cloud.syncNow().then(refresh)} disabled={!cloud.session || cloud.status === 'syncing'} />
      <Button title="Atualizar diagnóstico" icon="refresh" variant="ghost" onPress={refresh} disabled={busy} />
      <Button title="Compartilhar diagnóstico" icon="share-variant-outline" onPress={share} />
      <T variant="caption">O texto compartilhado leva só contagens e estados, com o e-mail mascarado — sem valores, descrições ou nomes.</T>
    </Screen>
  );
}
