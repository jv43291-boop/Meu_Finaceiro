import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { formatDateBR, monthOf } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import type { EntryInput } from '@/domain/operations';
import { findSimilarEntry, parseStatement, type StatementLine, type StatementType } from '@/domain/statement';
import { useFinance } from '@/state/finance';
import { Button, Card, Chip, Empty, Field, Icon, Pill, Screen, T, tapFeedback } from '@/ui/components';
import { confirmAsk, notify } from '@/ui/dialogs';
import { pickFromFiles, readerAvailable, readStatementFile, type ReceiptFile } from '@/ui/receiptReader';
import { space, useColors } from '@/ui/theme';

interface Item {
  line: StatementLine;
  type: StatementType | null;
  include: boolean;
  /** já existe no app (importado antes ou lançado pelo comprovante) */
  duplicate: boolean;
}

export default function StatementScreen() {
  const c = useColors();
  const f = useFinance();
  const params = useLocalSearchParams<{ uri?: string; mime?: string; name?: string }>();
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review'>('pick');
  const [progress, setProgress] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [info, setInfo] = useState<{ pages: number; truncated: boolean; skipped: number; text: string } | null>(null);
  const [accountId, setAccountId] = useState<string | null>(f.defaultAccountId);
  const [showText, setShowText] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function load(file: ReceiptFile) {
    setPhase('reading');
    setProgress('Abrindo o arquivo…');
    try {
      const r = await readStatementFile(file, (i, n) => setProgress(`Lendo página ${i + 1} de ${n}…`));
      const s = parseStatement(r.rows);
      setItems(
        s.lines.map((line) => {
          const duplicate = !!findSimilarEntry(f.transactions, line, line.type);
          // aplicação, resgate, fatura e repetidos vêm desmarcados; sem sentido também (precisa escolher)
          return { line, type: line.type, duplicate, include: !duplicate && !line.transferLike && !!line.type };
        }),
      );
      setInfo({ pages: r.pages, truncated: r.truncated, skipped: s.skipped, text: r.text });
      setShowText(false);
      setPhase('review');
      tapFeedback('success');
    } catch (e) {
      setPhase('pick');
      await notify('Não consegui ler o extrato', e instanceof Error ? e.message : String(e));
    }
  }

  // veio da tela de comprovante com o arquivo já escolhido
  useEffect(() => {
    if (started.current || !params.uri) return;
    started.current = true;
    const t = setTimeout(() => load({ uri: params.uri!, mimeType: params.mime ?? null, name: params.name ?? null }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.uri]);

  async function choose() {
    const file = await pickFromFiles();
    if (file) await load(file);
  }

  function update(i: number, patch: Partial<Item>) {
    setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }

  function cycleType(i: number) {
    const it = items[i];
    const next: StatementType = it.type === 'expense' ? 'income' : 'expense';
    update(i, { type: next, include: it.include || (!it.duplicate && !it.line.transferLike) });
  }

  const chosen = items.filter((it) => it.include);
  const undecided = chosen.filter((it) => !it.type).length;
  const totals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const it of items) if (it.include && it.type === 'income') inc += it.line.amountCents; else if (it.include && it.type === 'expense') exp += it.line.amountCents;
    return { inc, exp };
  }, [items]);
  const accounts = f.accounts.filter((a) => !a.archived);

  async function save() {
    if (!chosen.length) return notify('Nada marcado', 'Marque os lançamentos que quer trazer.');
    if (undecided) return notify('Falta escolher', `${undecided} lançamento(s) marcado(s) sem dizer se é gasto ou entrada. Toque no “?” de cada um.`);
    const ok = await confirmAsk(
      'Lançar do extrato?',
      `${chosen.length} lançamento(s): entradas ${formatBRL(totals.inc)}, gastos ${formatBRL(totals.exp)}. Todos entram como já pagos/recebidos, cada um no dia do extrato.`,
      'Lançar',
    );
    if (!ok) return;
    setBusy(true);
    try {
      const inputs: EntryInput[] = chosen.map((it) => ({
        type: it.type!, description: it.line.description, amountCents: it.line.amountCents, date: it.line.date,
        paid: true, categoryId: null, accountId,
        notes: ['Importado do extrato', it.line.detail].filter(Boolean).join(' · '),
        externalId: it.line.key,
      }));
      await f.createMany(inputs);
      tapFeedback('success');
      f.setSelectedMonth(monthOf(chosen[0].line.date));
      router.replace('/lancamentos');
    } catch (e) {
      await notify('Não foi possível lançar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {phase === 'pick' ? (
        <Card>
          <T variant="heading">Importar extrato do mês</T>
          <T variant="caption">
            No app do banco, gere o extrato em PDF do mês e escolha aqui. Cada linha vira um lançamento, separando gastos e entradas; você confere tudo antes. A leitura é feita no próprio celular.
          </T>
          {readerAvailable ? (
            <Button title="Escolher PDF do extrato" icon="file-pdf-box" onPress={choose} />
          ) : (
            <Empty icon="cellphone-arrow-down" title="Só no app instalado" text="A leitura usa um recurso do celular que não existe no Expo Go nem na web. Instale o APK do Live." />
          )}
        </Card>
      ) : null}

      {phase === 'reading' ? (
        <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
          <ActivityIndicator color={c.primary} />
          <T variant="bodyStrong">{progress}</T>
        </Card>
      ) : null}

      {phase === 'review' && info ? (
        <>
          <Card>
            <T variant="heading">{items.length} lançamento(s) encontrados</T>
            <T variant="caption">
              {info.pages} página(s) lida(s). Marcados: entradas {formatBRL(totals.inc)} · gastos {formatBRL(totals.exp)}.
              {info.truncated ? ' O PDF tem mais de 30 páginas: só as 30 primeiras foram lidas.' : ''}
              {info.skipped ? ` ${info.skipped} valor(es) sem data ficaram de fora.` : ''}
            </T>
            <T variant="caption">
              Vêm desmarcados: o que já está no app, aplicação/resgate/fatura do cartão (não são gasto nem receita) e o que o extrato não diz se é gasto ou entrada.
            </T>
          </Card>

          {accounts.length > 1 ? (
            <Field label="Conta do extrato">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {accounts.map((a) => (
                  <Chip key={a.id} label={a.name} icon="wallet-outline" color={a.color} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
                ))}
              </View>
            </Field>
          ) : null}

          {items.length ? (
            <Card style={{ gap: 0, paddingVertical: space.sm }}>
              {items.map((it, i) => (
                <View key={it.line.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, opacity: it.include ? 1 : 0.55 }}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: it.include }} onPress={() => update(i, { include: !it.include })} hitSlop={8}>
                    <Icon name={it.include ? 'checkbox-marked' : 'checkbox-blank-outline'} color={it.include ? c.primary : c.muted} />
                  </Pressable>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="bodyStrong" numberOfLines={2}>{it.line.description}</T>
                    <T variant="caption" numberOfLines={1}>{formatDateBR(it.line.date)}{it.line.detail ? ` · ${it.line.detail}` : ''}</T>
                    {it.duplicate || it.line.transferLike ? (
                      <View style={{ flexDirection: 'row', gap: space.xs ?? 4, flexWrap: 'wrap' }}>
                        {it.duplicate ? <Pill label="já está no app" /> : null}
                        {it.line.transferLike ? <Pill label="aplicação/fatura/transferência" /> : null}
                      </View>
                    ) : null}
                  </View>
                  <Pressable onPress={() => cycleType(i)} hitSlop={6} style={{ alignItems: 'flex-end', gap: 2 }} accessibilityLabel="Trocar gasto ou entrada">
                    <T variant="bodyStrong" color={it.type === 'income' ? c.income : it.type === 'expense' ? c.expense : c.warning}>
                      {it.type === 'income' ? '+' : it.type === 'expense' ? '−' : '?'} {formatBRL(it.line.amountCents)}
                    </T>
                    <T variant="caption" color={it.type ? undefined : c.warning}>{it.type === 'income' ? 'entrada' : it.type === 'expense' ? 'gasto' : 'toque p/ escolher'}</T>
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : (
            <Empty icon="file-search-outline" title="Não achei lançamentos" text="O texto lido não tem linhas com data e valor. Veja o texto lido abaixo e me mande o formato para ajustar a leitura." />
          )}

          <Button title={`Lançar ${chosen.length} marcado(s)`} icon="check" onPress={save} disabled={busy || !chosen.length} />
          <Button title="Ler outro extrato" icon="refresh" variant="secondary" onPress={() => setPhase('pick')} disabled={busy} />
          <Button title={showText ? 'Esconder texto lido' : 'Ver texto lido'} icon="text-recognition" variant="ghost" onPress={() => setShowText((v) => !v)} />
          {showText ? (
            <Card>
              <T variant="caption" selectable style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{info.text}</T>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
