import { Image } from 'expo-image';
import { router } from 'expo-router';
import { clearSharedPayloads, useIncomingShare } from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { getMeta, setMeta } from '@/db/repo';
import { formatDateBR, monthOf, parseDateBR, todayISO, type DateISO } from '@/domain/dates';
import { formatBRL, formatPlain, parseMoney } from '@/domain/money';
import { findDuplicatePix, findPayeeRule, normalizeName, suggestFromHistory, upsertPayeeRule } from '@/domain/payeeRules';
import { learnIdentity, parseIdentity } from '@/domain/pixIdentity';
import type { PixReceipt } from '@/domain/pixReceipt';
import { receiptWhen } from '@/domain/receiptMonth';
import type { EntryType } from '@/domain/types';
import { ctx, useFinance } from '@/state/finance';
import { Button, Card, Chip, Empty, Field, Input, Pill, Screen, Segmented, SwitchRow, T, tapFeedback } from '@/ui/components';
import { confirmAsk, notify } from '@/ui/dialogs';
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

/** onde fica, no aparelho, quem é você nos comprovantes (apagado ao sair da conta) */
const IDENTITY_KEY = 'pix_identity';

/** a outra parte depende do sentido: no gasto é quem recebeu; na receita, quem pagou */
function otherSide(r: PixReceipt, type: EntryType | null) {
  if (type === 'income') return r.payer;
  if (type === 'expense') return r.payee;
  return { name: r.counterpartName, doc: r.counterpartDoc };
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
  const db = useSQLiteContext();
  const [phase, setPhase] = useState<'pick' | 'reading' | 'review'>('pick');
  const [result, setResult] = useState<ReadResult | null>(null);
  const [showText, setShowText] = useState(false);

  // null = o comprovante não diz se foi gasto ou receita: a pessoa escolhe (nunca vira gasto sozinho)
  const [type, setType] = useState<EntryType | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(f.defaultAccountId);
  const [dateText, setDateText] = useState(formatDateBR(todayISO()));
  const [remember, setRemember] = useState(true);
  const [fromHistory, setFromHistory] = useState(false);
  const [descTouched, setDescTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const receipt = result?.receipt ?? null;
  const side = receipt ? otherSide(receipt, type) : null;
  const name = side?.name ?? null;
  const doc = side?.doc ?? null;
  const rule = useMemo(() => findPayeeRule(f.payeeRules, name, doc), [f.payeeRules, name, doc]);
  const duplicate = useMemo(() => findDuplicatePix(f.transactions, receipt?.pixId ?? null), [f.transactions, receipt?.pixId]);

  /** descrição, categoria e conta sugeridas para a outra parte daquele sentido */
  function prefill(r: PixReceipt, t: EntryType | null, keepDescription: boolean) {
    const p = otherSide(r, t);
    const found = findPayeeRule(f.payeeRules, p.name, p.doc);
    // sem regra: sugere pelo que a pessoa já lançou para esse recebedor
    const hist = found ? null : suggestFromHistory(f.transactions, p.name);
    const fitsType = (id: string | null | undefined) => (id && t && f.categoryById.get(id)?.type === t ? id : null);
    setFromHistory(!!hist);
    if (!keepDescription) setDescription(found?.description ?? hist?.description ?? (p.name ? titleCase(p.name) : 'Pix'));
    setCategoryId(fitsType(found?.categoryId) ?? fitsType(hist?.categoryId));
    setAccountId(found?.accountId ?? f.defaultAccountId);
    // transferência para você mesmo: não vale criar regra "seu nome = descrição"
    setRemember(!found && !r.ownTransfer);
  }

  function chooseType(t: EntryType) {
    setType(t);
    if (receipt) prefill(receipt, t, descTouched);
  }

  async function load(file: ReceiptFile) {
    setPhase('reading');
    try {
      const me = parseIdentity(await getMeta(db, IDENTITY_KEY).catch(() => null));
      const r = await readReceipt(file, me);
      // só escolhe sozinho quando o comprovante mostra: o seu nome/CPF em um dos lados, ou "enviado"/"recebido"
      const t: EntryType | null = r.receipt.directionSource === 'default' ? null : r.receipt.direction === 'received' ? 'income' : 'expense';
      setResult(r);
      setType(t);
      setDescTouched(false);
      prefill(r.receipt, t, false);
      setAmount(r.receipt.amountCents ? formatPlain(r.receipt.amountCents) : '');
      // a data é a do Pix, nunca a de hoje: sem data legível, o campo fica vazio para a pessoa digitar
      setDateText(r.receipt.date ? formatDateBR(r.receipt.date) : '');
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
    if (!type) return notify('Foi gasto ou receita?', 'Escolha “Paguei” ou “Recebi” antes de lançar.');
    if (!cents || cents <= 0) return notify('Confira o valor', 'Informe um valor maior que zero.');
    if (!date) return notify('Confira a data', dateText.trim() ? 'Use o formato dd/mm/aaaa.' : 'Não achei a data no comprovante. Digite o dia em que o Pix foi feito.');
    if (receiptWhen(date, todayISO()).kind === 'future') {
      const ok = await confirmAsk('Data no futuro?', `${formatDateBR(date)} ainda não chegou. Pode ter sido erro de leitura. Lançar assim mesmo?`, 'Lançar');
      if (!ok) return;
    }
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
      // aprende quem é você: no gasto, quem pagou; na receita, quem recebeu
      if (receipt) {
        const mine = type === 'income' ? receipt.payee : receipt.payer;
        const me = parseIdentity(await getMeta(db, IDENTITY_KEY).catch(() => null));
        await setMeta(db, IDENTITY_KEY, JSON.stringify(learnIdentity(me, mine))).catch(() => undefined);
      }
      if (remember && name && normalizeName(name)) {
        await f.savePayeeRule(upsertPayeeRule(f.payeeRules, { name, doc, description, categoryId, accountId }, ctx));
      } else if (rule) {
        // usou a regra sem mudar: conta como "usada agora" para o desempate
        await f.savePayeeRule({ ...rule, updatedAt: ctx.now() });
      }
      tapFeedback('success');
      reset();
      // abre a lista no mês do Pix (que pode não ser o mês atual)
      f.setSelectedMonth(monthOf(date));
      router.replace('/lancamentos');
    } catch (e) {
      await notify('Não foi possível salvar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const when = receiptWhen(parseDateBR(dateText, new Date().getFullYear()), todayISO());
  const at = receipt?.time ? ` às ${receipt.time}` : '';
  const dateHint =
    when.kind === 'missing' ? (dateText.trim() ? 'Use o formato dd/mm/aaaa.' : 'Não achei a data no comprovante: digite o dia do Pix.')
      : when.kind === 'future' ? `Data depois de hoje${at}: confira, pode ser erro de leitura.`
        : when.kind === 'current' ? `Feito${at}. Entra em ${when.label}, o mês atual.`
          : `Feito${at}. Entra em ${when.label}, não no mês atual${when.old ? ` (${when.monthsAgo} meses atrás: confira)` : ''}.`;

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

      {phase === 'review' && result && receipt?.looksLikeStatement ? (
        <>
          <Card style={{ borderWidth: 1.5, borderColor: c.warning }}>
            <T variant="bodyStrong" color={c.warning}>Isso parece um extrato, não um comprovante</T>
            <T variant="caption">
              O arquivo tem vários lançamentos com data e valor. Esta tela lança um Pix por vez, então não vou transformar o extrato inteiro em um lançamento só. A importação de extrato (cada linha vira um lançamento, separando gastos e entradas) ainda está sendo feita.
            </T>
          </Card>
          <Button title="Ler um comprovante" icon="refresh" onPress={reset} />
          <Button title={showText ? 'Esconder texto lido' : 'Ver texto lido'} icon="text-recognition" variant="ghost" onPress={() => setShowText((v) => !v)} />
          {showText ? (
            <Card>
              <T variant="caption" selectable style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{result.text}</T>
            </Card>
          ) : null}
        </>
      ) : null}

      {phase === 'review' && result && receipt && !receipt.looksLikeStatement ? (
        <>
          {receipt.ownTransfer ? (
            <Card style={{ borderWidth: 1.5, borderColor: c.warning }}>
              <T variant="bodyStrong" color={c.warning}>Parece transferência entre suas contas</T>
              <T variant="caption">
                Você aparece como quem pagou e como quem recebeu. Se lançar como {type === 'income' ? 'receita' : 'gasto'}, o saldo total muda sem você ter {type === 'income' ? 'recebido' : 'gastado'} nada. Normalmente não é para lançar.
              </T>
            </Card>
          ) : null}

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
              <T variant="caption">{type === 'income' ? 'Quem mandou' : type === 'expense' ? 'Quem recebeu' : 'Outra parte'}</T>
              <T variant="bodyStrong">{name ?? 'Não encontrei o nome'}</T>
              {doc ? <T variant="caption">{maskDoc(doc)}</T> : null}
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                {receipt.bank ? <Pill tone="primary" label={receipt.bank} /> : null}
                {rule ? <Pill tone="primary" label="regra salva" /> : fromHistory ? <Pill tone="primary" label="sugerido pelo histórico" /> : null}
                {!receipt.looksLikePix ? <Pill label="não parece Pix" /> : null}
              </View>
            </View>
          </Card>

          <Field
            label="Foi gasto ou receita?"
            hint={
              !type ? undefined
              : receipt.directionSource === 'identity' ? `Reconheci você como quem ${type === 'income' ? 'recebeu' : 'pagou'}.`
              : receipt.directionSource === 'keyword' ? `O comprovante diz que o Pix foi ${type === 'income' ? 'recebido' : 'enviado'}.`
              : undefined
            }
          >
            {!type ? (
              <T variant="caption" color={c.warning}>
                O comprovante não diz se você pagou ou recebeu. Escolha abaixo: nas próximas vezes eu reconheço você pelo nome.
              </T>
            ) : null}
            <Segmented
              value={type}
              onChange={chooseType}
              options={[{ value: 'expense', label: 'Paguei', color: c.expense }, { value: 'income', label: 'Recebi', color: c.income }]}
            />
          </Field>

          <Field label="Valor" hint={receipt.amountCents ? undefined : 'Não achei o valor no comprovante: digite.'}>
            <Input large value={amount} onChangeText={setAmount} placeholder="0,00" keyboardType="decimal-pad" />
          </Field>

          <Field label="Descrição" hint={name ? `Troque o nome da pessoa pelo que foi o gasto. Ex.: ${type === 'income' ? 'Venda do bolo' : 'Compra de pão'}` : undefined}>
            <Input value={description} onChangeText={(v) => { setDescription(v); setDescTouched(true); }} placeholder="Ex.: Compra de pão" maxLength={200} />
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

          <Field label="Data do Pix" hint={dateHint}>
            <Input value={dateText} onChangeText={setDateText} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
          </Field>

          {name ? (
            <SwitchRow
              title={`Lembrar para ${titleCase(name)}`}
              subtitle={`Nos próximos Pix com essa pessoa, já vem “${description.trim() || '…'}”${categoryId ? ` em ${f.categoryById.get(categoryId)?.name ?? ''}` : ''}.`}
              value={remember}
              onChange={setRemember}
            />
          ) : null}

          <Button
            title={!type ? 'Escolha Paguei ou Recebi' : duplicate || receipt.ownTransfer ? 'Lançar mesmo assim' : type === 'income' ? 'Lançar como recebido' : 'Lançar como pago'}
            icon="check"
            onPress={save}
            disabled={busy || !type}
          />
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
