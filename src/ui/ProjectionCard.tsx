import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { todayISO } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { projectBalance } from '@/domain/projection';
import { useFinance } from '@/state/finance';
import { Amount, Card, Chip, Icon, Segmented, T } from './components';
import { space, useColors, useHideValues } from './theme';

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Saldo previsto em 7, 30, 60 e 90 dias (o cálculo é todo do domínio: projection.ts). */
export function ProjectionCard() {
  const c = useColors();
  const hidden = useHideValues();
  const { accounts, transactions, recurrences, cards } = useFinance();
  const [mode, setMode] = useState<'total' | 'account'>('total');
  const [accountId, setAccountId] = useState<string | null>(null);
  const today = todayISO();
  const result = useMemo(() => projectBalance({ accounts, transactions, recurrences, cards }, today), [accounts, transactions, recurrences, cards, today]);

  const active = accounts.filter((a) => !a.archived && !a.deletedAt);
  const chosen = mode === 'account' ? result.byAccount.find((p) => p.accountId === (accountId ?? active[0]?.id)) ?? null : null;
  const proj = chosen ?? result.total;

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T variant="heading">Projeção do saldo</T>
      </View>
      {active.length > 1 ? (
        <Segmented value={mode} onChange={setMode} options={[{ value: 'total', label: 'Total' }, { value: 'account', label: 'Por conta' }]} />
      ) : null}
      {mode === 'account' && active.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {active.map((a) => (
            <Chip key={a.id} label={a.name} icon="wallet-outline" color={a.color} selected={(accountId ?? active[0]?.id) === a.id} onPress={() => setAccountId(a.id)} />
          ))}
        </View>
      ) : null}

      <View style={{ gap: 2 }}>
        <Row label="Hoje" cents={proj.todayCents} delta={null} />
        {proj.points
          .filter((p) => p.days > 0)
          .map((p) => (
            <Row key={p.days} label={`Em ${p.days} dias`} sub={shortDate(p.date)} cents={p.balanceCents} delta={p.balanceCents - proj.todayCents} />
          ))}
      </View>

      {proj.lowest.balanceCents < proj.todayCents ? (
        <T variant="caption" color={proj.lowest.balanceCents < 0 ? c.danger : undefined}>
          Menor saldo previsto: {hidden ? 'R$ •••' : formatBRL(proj.lowest.balanceCents)} em {shortDate(proj.lowest.date)}.
        </T>
      ) : null}

      {result.overdue.count > 0 ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <Icon name="alert-outline" size={18} color={c.warning} />
          <T variant="caption" color={c.warning} style={{ flex: 1 }}>
            {result.overdue.count === 1 ? '1 conta atrasada não entra' : `${result.overdue.count} contas atrasadas não entram`} na projeção
            {hidden ? '' : ` (a pagar ${formatBRL(result.overdue.expenseCents)}${result.overdue.incomeCents ? `, a receber ${formatBRL(result.overdue.incomeCents)}` : ''})`}. Marque como pago ou ajuste a data.
          </T>
        </View>
      ) : null}
      {mode === 'account' && result.unassigned.count > 0 ? (
        <T variant="caption">
          {result.unassigned.count === 1 ? '1 lançamento previsto não tem conta' : `${result.unassigned.count} lançamentos previstos não têm conta`} e só aparece no total.
        </T>
      ) : null}
      <T variant="caption">Considera fixos, parcelas e faturas no vencimento. Metas não mexem no saldo.</T>
    </Card>
  );
}

function Row({ label, sub, cents, delta }: { label: string; sub?: string; cents: number; delta: number | null }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: space.sm }}>
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong">{label}</T>
        {sub ? <T variant="caption">{sub}</T> : null}
      </View>
      {delta !== null && delta !== 0 ? <Amount cents={Math.abs(delta)} size="caption" signed type={delta > 0 ? 'income' : 'expense'} color={delta > 0 ? c.income : c.expense} /> : null}
      <View style={{ minWidth: 110, alignItems: 'flex-end' }}>
        <Amount cents={cents} color={cents < 0 ? c.danger : undefined} />
      </View>
    </View>
  );
}
