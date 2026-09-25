import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { formatBRL } from '@/domain/money';
import { accountBalances } from '@/domain/summary';
import { useFinance } from '@/state/finance';
import { Amount, Button, Card, ListRow, Screen, T } from '@/ui/components';

const KIND_LABEL = { cash: 'Dinheiro', checking: 'Conta corrente', savings: 'Poupança', other: 'Outra' } as const;

export default function AccountsScreen() {
  const { accounts, transactions } = useFinance();
  const balances = useMemo(() => accountBalances(accounts, transactions), [accounts, transactions]);
  const total = [...balances.values()].reduce((a, b) => a + b, 0);
  return (
    <Screen>
      <Card>
        <T variant="label">Saldo total</T>
        <T variant="title">{formatBRL(total)}</T>
      </Card>
      <Card>
        {accounts.map((a) => (
          <ListRow key={a.id} icon="wallet-outline" iconColor={a.color} title={a.name}
            subtitle={`${KIND_LABEL[a.kind]}${a.archived ? ' · arquivada' : ''}`}
            right={<Amount cents={balances.get(a.id) ?? 0} />}
            onPress={() => router.push({ pathname: '/conta/[id]', params: { id: a.id } })} />
        ))}
      </Card>
      <View>
        <Button title="Nova conta" icon="plus" onPress={() => router.push({ pathname: '/conta/[id]', params: { id: 'nova' } })} />
      </View>
      <T variant="caption">O saldo de cada conta é o saldo inicial mais tudo que foi marcado como pago ou recebido nela.</T>
    </Screen>
  );
}
