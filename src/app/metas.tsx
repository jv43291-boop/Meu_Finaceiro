import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { formatDateBR, todayISO } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import { goalPlan } from '@/domain/planning';
import { useFinance } from '@/state/finance';
import { BudgetBar } from '@/ui/Charts';
import { Amount, Button, Card, Empty, Icon, Pill, Screen, T } from '@/ui/components';
import { space, useHideValues } from '@/ui/theme';

export default function GoalsScreen() {
  const { goals } = useFinance();
  const hidden = useHideValues();
  const today = todayISO();
  const active = goals.filter((g) => !g.archived);
  return (
    <Screen>
      {active.length === 0 ? (
        <Card>
          <Empty icon="piggy-bank-outline" title="Nenhuma meta ainda" text="Uma reserva de emergência, uma viagem, um curso. Diga quanto e até quando: o app calcula quanto guardar por mês." />
        </Card>
      ) : (
        active.map((g) => {
          const p = goalPlan(g, today);
          return (
            <Pressable key={g.id} onPress={() => router.push({ pathname: '/meta/[id]', params: { id: g.id } })}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: g.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={g.icon} color={g.color} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="bodyStrong">{g.name}</T>
                    <T variant="caption">{g.targetDate ? `até ${formatDateBR(g.targetDate)}` : 'sem data'}</T>
                  </View>
                  {p.done ? <Pill tone="primary" label="concluída" /> : p.late ? <Pill label="prazo passou" /> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <Amount cents={g.savedCents} size="heading" />
                  <T variant="caption">de {hidden ? 'R$ •••' : formatBRL(g.targetCents)}</T>
                </View>
                <BudgetBar ratio={p.pct} level="ok" label={`${Math.round(p.pct * 100)}% guardado`} />
                {!p.done && p.perMonthCents !== null ? (
                  <T variant="caption">
                    {p.late ? `Faltam ${hidden ? 'R$ •••' : formatBRL(p.remainingCents)}.` : `Guardar ${hidden ? 'R$ •••' : formatBRL(p.perMonthCents)} por mês (${p.monthsLeft} ${p.monthsLeft === 1 ? 'mês' : 'meses'}).`}
                  </T>
                ) : null}
              </Card>
            </Pressable>
          );
        })
      )}
      <Button title="Nova meta" icon="plus" onPress={() => router.push({ pathname: '/meta/[id]', params: { id: 'nova' } })} />
    </Screen>
  );
}
