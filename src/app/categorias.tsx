import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { EntryType } from '@/domain/types';
import { useFinance } from '@/state/finance';
import { Button, Card, ListRow, Screen, Segmented } from '@/ui/components';
import { useColors } from '@/ui/theme';

export default function CategoriesScreen() {
  const c = useColors();
  const { categories } = useFinance();
  const [type, setType] = useState<EntryType>('expense');
  const list = categories.filter((x) => x.type === type);
  return (
    <Screen>
      <Segmented value={type} onChange={setType} options={[{ value: 'expense', label: 'Despesas', color: c.expense }, { value: 'income', label: 'Receitas', color: c.income }]} />
      <Card>
        {list.map((cat) => (
          <ListRow key={cat.id} icon={cat.icon} iconColor={cat.color} title={cat.name} subtitle={cat.archived ? 'Arquivada' : undefined}
            onPress={() => router.push({ pathname: '/categoria/[id]', params: { id: cat.id } })} />
        ))}
      </Card>
      <View>
        <Button title="Nova categoria" icon="plus" onPress={() => router.push({ pathname: '/categoria/[id]', params: { id: 'nova', type } })} />
      </View>
    </Screen>
  );
}
