import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Platform, View } from 'react-native';

import { currentMonthKey, daysInMonth, formatDateBR, shiftMonth, type DateISO, type MonthKey } from '@/domain/dates';
import { buildCsv, exportFileName, exportItems, type ExportInput } from '@/domain/exportCsv';
import { useFinance } from '@/state/finance';
import { Button, Card, Chip, MonthSwitcher, Screen, SwitchRow, T } from '@/ui/components';
import { notify } from '@/ui/dialogs';
import { space } from '@/ui/theme';

type Period = 'month' | 'last3' | 'year' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'month', label: 'Um mês' },
  { value: 'last3', label: 'Últimos 3 meses' },
  { value: 'year', label: 'Este ano' },
  { value: 'all', label: 'Tudo' },
];

const first = (m: MonthKey): DateISO => `${m}-01`;
const last = (m: MonthKey): DateISO => `${m}-${String(daysInMonth(m)).padStart(2, '0')}`;

function rangeFor(period: Period, month: MonthKey, oldest: DateISO | null): { from: DateISO; to: DateISO } {
  const now = currentMonthKey();
  if (period === 'month') return { from: first(month), to: last(month) };
  if (period === 'last3') return { from: first(shiftMonth(now, -2)), to: last(now) };
  if (period === 'year') return { from: `${now.slice(0, 4)}-01-01`, to: `${now.slice(0, 4)}-12-31` };
  return { from: oldest ?? first(now), to: last(now) };
}

async function share(name: string, csv: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este celular não permite compartilhar arquivos.');
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Salvar ou enviar a planilha' });
}

export default function ExportScreen() {
  const { transactions, recurrences, categories, accounts, cards, selectedMonth } = useFinance();
  const [period, setPeriod] = useState<Period>('month');
  const [month, setMonth] = useState<MonthKey>(selectedMonth);
  const [forecast, setForecast] = useState(false);
  const [busy, setBusy] = useState(false);

  const oldest = useMemo(() => transactions.reduce<DateISO | null>((min, t) => (!t.deletedAt && (!min || t.date < min) ? t.date : min), null), [transactions]);
  const range = rangeFor(period, month, oldest);
  const input: ExportInput = { ...range, transactions, recurrences, categories, accounts, cards, includeForecast: forecast };
  const count = exportItems(input).length;

  async function run() {
    setBusy(true);
    try {
      await share(exportFileName(range.from, range.to), buildCsv(input));
    } catch (e) {
      await notify('Não foi possível exportar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <T variant="label">Período</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {PERIODS.map((p) => (
            <Chip key={p.value} label={p.label} selected={period === p.value} onPress={() => setPeriod(p.value)} />
          ))}
        </View>
        {period === 'month' ? <MonthSwitcher month={month} onChange={setMonth} /> : null}
        <T variant="caption">
          De {formatDateBR(range.from)} a {formatDateBR(range.to)}
        </T>
      </Card>

      <SwitchRow
        title="Incluir fixos previstos"
        subtitle="Recorrências que ainda não foram lançadas no período"
        value={forecast}
        onChange={setForecast}
      />

      <Card>
        <T variant="bodyStrong">{count === 0 ? 'Nada para exportar nesse período' : count === 1 ? '1 lançamento' : `${count} lançamentos`}</T>
        <T variant="caption">
          Arquivo CSV que abre no Excel e no Google Planilhas. Despesas saem com valor negativo; compras no cartão e o pagamento da fatura aparecem os dois — filtre pela coluna “Tipo” para não somar em dobro.
        </T>
        <Button title={busy ? 'Gerando…' : 'Exportar planilha'} icon="file-delimited-outline" onPress={run} disabled={busy || count === 0} />
      </Card>
    </Screen>
  );
}
