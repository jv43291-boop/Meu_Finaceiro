import { Redirect, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { transactionToItem, virtualItem } from '@/domain/recurrence';
import { parseItemKey } from '@/domain/types';
import { useFinance } from '@/state/finance';
import { Empty, Screen } from '@/ui/components';
import { EntryForm } from '@/ui/EntryForm';
import { goBack } from '@/ui/nav';

export default function EditEntryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { transactions, recurrences } = useFinance();

  // resolve uma vez: depois de salvar, o item virtual vira real e a chave muda
  const item = useMemo(() => {
    if (!key) return null;
    const parsed = parseItemKey(key);
    if (parsed.kind === 'tx') {
      const t = transactions.find((x) => x.id === parsed.id && !x.deletedAt);
      return t ? transactionToItem(t) : null;
    }
    if (parsed.kind === 'invoice') return null;
    const existing = transactions.find((x) => x.recurrenceId === parsed.recurrenceId && x.occurrenceMonth === parsed.month && !x.deletedAt);
    if (existing) return transactionToItem(existing);
    const rule = recurrences.find((r) => r.id === parsed.recurrenceId);
    return rule ? virtualItem(rule, parsed.month) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const parsedKey = key ? parseItemKey(key) : null;
  if (parsedKey?.kind === 'invoice') {
    return <Redirect href={{ pathname: '/cartao/[id]', params: { id: parsedKey.cardId, mes: parsedKey.month } }} />;
  }
  if (!item) {
    return (
      <Screen>
        <Empty icon="file-question-outline" title="Lançamento não encontrado" text="Ele pode ter sido excluído." />
      </Screen>
    );
  }
  return <EntryForm item={item} onDone={() => goBack()} />;
}
