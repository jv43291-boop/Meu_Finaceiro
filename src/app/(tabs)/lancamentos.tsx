import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDateLong } from '@/domain/dates';
import { itemsForMonth } from '@/domain/recurrence';
import { summarizeItems } from '@/domain/summary';
import type { ListItem } from '@/domain/types';
import { useFinance } from '@/state/finance';
import { Amount, Chip, Empty, Input, MonthSwitcher, T, cardShadow } from '@/ui/components';
import { ItemRow } from '@/ui/ItemRow';
import { radius, space, useColors } from '@/ui/theme';

type Filter = 'all' | 'income' | 'expense' | 'pending';

export default function EntriesScreen() {
  const c = useColors();
  const { transactions, recurrences, selectedMonth, setSelectedMonth, categoryById } = useFinance();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const { sections, summary, total } = useMemo(() => {
    const all = itemsForMonth(selectedMonth, transactions, recurrences);
    const q = query.trim().toLowerCase();
    const filtered = all.filter((it) => {
      if (filter === 'income' && it.type !== 'income') return false;
      if (filter === 'expense' && it.type !== 'expense') return false;
      if (filter === 'pending' && it.paid) return false;
      if (q) {
        const cat = it.categoryId ? categoryById.get(it.categoryId)?.name ?? '' : '';
        if (!`${it.description} ${cat} ${it.notes}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const byDate = new Map<string, ListItem[]>();
    for (const it of filtered) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
    return {
      sections: [...byDate.entries()].map(([date, data]) => ({ title: date, data })),
      summary: summarizeItems(all),
      total: all.length,
    };
  }, [transactions, recurrences, selectedMonth, filter, query, categoryById]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.md }}>
        <MonthSwitcher month={selectedMonth} onChange={setSelectedMonth} />
        <View style={[{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg }, cardShadow(c)]}>
          <Stat label="Receitas" cents={summary.income} type="income" />
          <Stat label="Despesas" cents={summary.expense} type="expense" />
          <Stat label="Resultado" cents={Math.abs(summary.result)} type={summary.result >= 0 ? 'income' : 'expense'} />
        </View>
        <Input placeholder="Buscar descrição, categoria ou nota" value={query} onChangeText={setQuery} returnKeyType="search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          <Chip label="Todos" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Receitas" selected={filter === 'income'} onPress={() => setFilter('income')} color={c.income} />
          <Chip label="Despesas" selected={filter === 'expense'} onPress={() => setFilter('expense')} color={c.expense} />
          <Chip label="Pendentes" selected={filter === 'pending'} onPress={() => setFilter('pending')} color={c.warning} />
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(it) => it.key}
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: 40 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <T variant="label" style={{ marginTop: space.lg, marginBottom: space.xs }}>{formatDateLong(section.title)}</T>
        )}
        renderItem={({ item }) => (
          <ItemRow item={item} onPress={() => router.push({ pathname: '/lancamento/[key]', params: { key: item.key } })} />
        )}
        ListEmptyComponent={
          <Empty
            icon="calendar-blank-outline"
            title={total === 0 ? 'Nenhum lançamento neste mês' : 'Nada encontrado'}
            text={total === 0 ? 'Use o botão + para adicionar.' : 'Tente outro filtro ou busca.'}
          />
        }
      />
    </SafeAreaView>
  );
}

function Stat({ label, cents, type }: { label: string; cents: number; type: 'income' | 'expense' }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <T variant="caption">{label}</T>
      <Amount cents={cents} type={type} />
    </View>
  );
}
