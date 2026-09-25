import Constants from 'expo-constants';
import { router } from 'expo-router';

import { formatBRL } from '@/domain/money';
import { totalBalance } from '@/domain/summary';
import { useFinance } from '@/state/finance';
import { Card, ListRow, Screen, T } from '@/ui/components';

export default function MoreScreen() {
  const { accounts, categories, transactions } = useFinance();
  return (
    <Screen>
      <T variant="title">Mais</T>
      <Card>
        <ListRow icon="wallet-outline" title="Contas" subtitle={`${accounts.length} conta(s) · ${formatBRL(totalBalance(accounts, transactions))}`} onPress={() => router.push('/contas')} />
        <ListRow icon="shape-outline" title="Categorias" subtitle={`${categories.length} categorias`} onPress={() => router.push('/categorias')} />
      </Card>
      <Card>
        <ListRow icon="database-import-outline" title="Importar do app antigo" subtitle="Traz os lançamentos do backup do Meu Financeiro 1.0" onPress={() => router.push('/importar')} />
      </Card>
      <Card>
        <T variant="label">Em breve</T>
        <T variant="caption">Sincronização automática com a nuvem, cartão de crédito, orçamentos, metas e relatórios.</T>
      </Card>
      <T variant="caption" style={{ textAlign: 'center' }}>Meu Financeiro {Constants.expoConfig?.version ?? ''}</T>
    </Screen>
  );
}
