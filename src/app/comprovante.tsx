import { Image } from 'expo-image';
import { router } from 'expo-router';
import { clearSharedPayloads, useIncomingShare } from 'expo-sharing';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { formatDateBR, parseDateBR, todayISO, type DateISO } from '@/domain/dates';
import { formatBRL, formatPlain, parseMoney } from '@/domain/money';
import { findDuplicatePix, findPayeeRule, normalizeName, upsertPayeeRule } from '@/domain/payeeRules';
import type { EntryType } from '@/domain/types';
import { ctx, useFinance } from '@/state/finance';
import { Button, Card, Chip, Empty, Field, Input, Pill, Screen, Segmented, SwitchRow, T, tapFeedback } from '@/ui/components';
import { notify } from '@/ui/dialogs';
import { pickFromFiles, pickFromGallery, readerAvailable, readReceipt, type ReadResult, type ReceiptFile } from '@/ui/receiptReader';
import { space, useColors } from '@/ui/theme';

/** "JOSE RIBEIRO DA SILVA" → "Jose Ribeiro da Silva" */
function titleCase(name: string): string {
  const small = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function maskDoc(doc: string): string {
  return doc.length >= 11 && doc.length <= 14 && doc.length !== 11 ? `CNPJ ${doc}` : `CPF •••${doc}••`;
}

/** Recebe o arquivo quando alguém usa "Compartilhar → Live" (só existe no APK). */
function ShareListener({ onFile }: { onFile: (f: ReceiptFile) => void }) {
  const { resolvedSharedPayloads } = useIncomingShare();
  const used = useRef<string | null>(null);
  useEffect(() => {
    const p = resolvedSharedPayloads.find((x) => x.contentUri && (x.contentType === 'image' || x.contentType === 'file'));
    if (!p?.contentUri || used.current === p.contentUri) return;
    used.current = p.contentUri;
    onFile({ uri: p.contentUri, mimeType: p.contentMimeType ?? p.mimeType ?? null, name: p.originalName });
  }, [resolvedSharedPayloads, onFile]);
  return null;
}

export default function ReceiptScreen() {
  const c = useColors();
  const f = useFinance();
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review'>('pick');
  const [result, setResult] = useState<ReadResult | null>(null);
  const [showText, setShowText] = useState(false);

  const [type, setType] = useState<EntryType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(f.defaultAccountId);
  const [dateText, setDateText] = useState(formatDateBR(todayISO()));
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  const receipt = result?.receipt ?? null;
  const name = receipt?.counterpartName ?? null;
  const doc = receipt?.counterpartDoc ?? null;
  const rule = useMemo(() => findPayeeRule(f.payeeRules, name, doc), [f.payeeRules, name, doc]);
  const duplicate = useMemo(() => findDuplicatePix(f.transactions, receipt?.pixId ?? null), [f.transactions, receipt?.pixId]);

  async function load(file: ReceiptFile) {
    setPhase('reading');
    try {
      const r = await readReceipt(file);
      const found = findPayeeRule(f.payeeRules, r.receipt.counterpartName, r.receipt.counterpartDoc);
      setResult(r);
      setType(r.receipt.direction === 'received' ? 'income' : 'expense');
      setAmount(r.receipt.amountCents ? formatPlain(r.receipt.amountCents) : '');
      setDescription(found?.description ?? (r.receipt.counterpartName ? titleCase(r.receipt.counterpartName) : 'Pix'));
      setCategoryId(found?.categoryId ?? null);
      setAccountId(found?.accountId ?? f.defaultAccountId);
      setDateText(formatDateBR(r.receipt.date ?? todayISO()));
      setRemember(!found);
      setShowText(false);
      setPhase('review');
      tapFeedback('success');
    } catch (e) {
      setPhase('pick');
      await notify('Não consegui ler o comprovante', e instanceof Error ? e.message : String(e));
    }
  }

  async function choose(from: 'gallery' | 'files') {
    const file = from === 'gallery' ? await pickFromGallery() : await pickFromFiles();
    if (file) await load(file);
  }

  function reset() {
    if (readerAvailable) {
      try {
        clearSharedPayloads();
      } catch {
        // nada compartilhado
      }
    }
    setResult(null);
    setPhase('pick');
  }

  async function save() {
    const cents = parseMoney(amount);
    const date: DateISO | null = parseDateBR(dateText, new Date().getFullYear());
    if (!cents || cents <= 0) return notify('Confira o valor', 'Informe um valor maior que zero.');
    if (!date) return notify('Confira a data', 'Use o formato dd/mm/aaaa.');
    if (!description.trim()) return notify('Falta a descrição', 'Ex.: Compra de pão');
    setBusy(true);
    try {
      const who = name ? `${type === 'income' ? 'Pix de' : 'Pix para'} ${name}` : 'Pix';
      await f.create(
        {
          type, description: description.trim(), amountCents: cents, date, paid: true, categoryId, accountId,
          notes: [who, receipt?.bank ? `via ${receipt.bank}` : null].filter(Boolean).join(' · '),
          externalId: receipt?.pixId ?? null,
        },
        { kind: 'none' },
      );
      if (remember && name && normalizeName(name)) {
        await f.savePayeeRule(upsertPayeeRule(f.payeeRules, { name, doc, description, categoryId, accountId }, ctx));
      } else if (rule) {
        // usou a regra sem mudar: conta como "usada agora" para o desempate
        await f.savePayeeRule({ ...rule, updatedAt: ctx.now() });
      }
      tapFeedback('success');
      reset();
      router.replace('/lancamentos');
    } catch (e) {
      await notify('Não foi possível salvar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const categories = f.categories.filter((cat) => cat.type === type && !cat.archived);
  const accounts = f.accounts.filter((a) => !a.archived);

  return (
    <Screen>
      {readerAvailable && Platform.OS !== 'web' ? <ShareListener onFile={load} /> : null}

      {phase === 'pick' ? (
        <>
          <Card>
            <T variant="heading">Lançar um Pix pelo comprovante</T>
            <T variant="caption">
              No app do banco, toque em “Compartilhar comprovante” e escolha o Live. Ou escolha aqui o print ou o PDF. A leitura é feita no próprio celular.
            </T>
            {readerAvailable ? (
              <View style={{ gap: space.sm }}>
                <Button title="Escolher print da galeria" icon="image-outline" onPress={() => choose('gallery')} />
                <Button title="Escolher PDF ou arquivo" icon="file-pdf-box" variant="secondary" onPress={() => choose('files')} />
              </View>
            ) : (
              <Empty icon="cellphone-arrow-down" title="Só no app instalado" text="A leitura usa um recurso do celular que não existe no Expo Go nem na web. Instale o APK do Live." />
            )}
          </Card>
          <Button title="Regras de recebedores" icon="account-switch-outline" variant="ghost" onPress={() => router.push('/recebedores')} />
        </>
      ) : null}

      {phase === 'reading' ? (
        <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
          <ActivityIndicator color={c.primary} />
          <T variant="bodyStrong">Lendo o comprovante…</T>
        </Card>
      ) : null}

      {phase === 'review' && result && receipt ? (
        <>
          {duplicate ? (
            <Card style={{ borderWidth: 1.5, borderColor: c.warning }}>
              <T variant="bodyStrong" color={c.warning}>Este comprovante já foi lançado</T>
              <T variant="caption">
                {formatDateBR(duplicate.date)} · {duplicate.description} · {formatBRL(duplicate.amountCents)}. Se salvar de novo, o valor sai duas vezes do saldo.
              </T>
            </Card>
          ) : null}

          <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <Image source={{ uri: result.imageUri }} contentFit="contain" style={{ width: 64, height: 96, borderRadius: 8, backgroundColor: c.surfaceAlt }} />
            <View style={{ flex: 1, gap: 4 }}>
              <T variant="caption">{receipt.direction === 'received' ? 'Quem mandou' : 'Quem recebeu'}</T>
              <T variant="bodyStrong">{name ?? 'Não encontrei o nome'}</T>
              {doc ? <T variant="caption">{maskDoc(doc)}</T> : null}
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                {receipt.bank ? <Pill tone="primary" label={receipt.bank} /> : null}
                {rule ? <Pill tone="primary" label="regra salva" /> : null}
                {!receipt.looksLikePix ? <Pill label="não parece Pix" /> : null}
              </View>
            </View>
          </Card>

          <Segmented
            value={type}
            onChange={(t) => { setType(t); setCategoryId(null); }}
            options={[{ value: 'expense', label: 'Paguei', color: c.expense }, { value: 'income', label: 'Recebi', color: c.income }]}
          />

          <Field label="Valor" hint={receipt.amountCents ? undefined : 'Não achei o valor no comprovante: digite.'}>
            <Input large value={amount} onChangeText={setAmount} placeholder="0,00" keyboardType="decimal-pad" />
          </Field>

          <Field label="Descrição" hint={name ? `Troque o nome da pessoa pelo que foi o gasto. Ex.: ${type === 'income' ? 'Venda do bolo' : 'Compra de pão'}` : undefined}>
            <Input value={description} onChangeText={setDescription} placeholder="Ex.: Compra de pão" />
          </Field>

          <Field label="Categoria">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {categories.map((cat) => (
                <Chip key={cat.id} label={cat.name} icon={cat.icon} color={cat.color} selected={categoryId === cat.id} onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)} />
              ))}
            </View>
          </Field>

          {accounts.length > 1 ? (
            <Field label={type === 'income' ? 'Entrou na conta' : 'Saiu da conta'}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {accounts.map((a) => (
                  <Chip key={a.id} label={a.name} icon="wallet-outline" color={a.color} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
                ))}
              </View>
            </Field>
          ) : null}

          <Field label="Data" hint={receipt.time ? `Feito às ${receipt.time}` : undefined}>
            <Input value={dateText} onChangeText={setDateText} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
          </Field>

          {name ? (
            <SwitchRow
              title={`Lembrar para ${titleCase(name)}`}
              subtitle={`Nos próximos Pix para essa pessoa, já vem “${description.trim() || '…'}”${categoryId ? ` em ${f.categoryById.get(categoryId)?.name ?? ''}` : ''}.`}
              value={remember}
              onChange={setRemember}
            />
          ) : null}

          <Button title={duplicate ? 'Lançar mesmo assim' : type === 'income' ? 'Lançar como recebido' : 'Lançar como pago'} icon="check" onPress={save} disabled={busy} />
          <Button title="Ler outro comprovante" icon="refresh" variant="secondary" onPress={reset} disabled={busy} />

          <Button title={showText ? 'Esconder texto lido' : 'Ver texto lido'} icon="text-recognition" variant="ghost" onPress={() => setShowText((v) => !v)} />
          {showText ? (
            <Card>
              <T variant="caption" selectable style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{result.text}</T>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
