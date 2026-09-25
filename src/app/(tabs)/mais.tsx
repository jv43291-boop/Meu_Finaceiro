import Constants from 'expo-constants';
import { router } from 'expo-router';

import { formatBRL } from '@/domain/money';
import { totalBalance } from '@/domain/summary';
import { useCloud } from '@/state/cloud';
import { useFinance } from '@/state/finance';
import { Card, ListRow, Screen, T } from '@/ui/components';
import { useAppTheme } from '@/ui/theme';

const THEME_LABEL = { system: 'Automático (segue o celular)', light: 'Claro', dark: 'Escuro' } as const;

export default function MoreScreen() {
  const { accounts, categories, transactions } = useFinance();
  const { preference } = useAppTheme();
  const cloud = useCloud();
  const cloudSubtitle = !cloud.configured
    ? 'Nuvem não configurada'
    : !cloud.session
      ? 'Entre para guardar seus dados na nuvem'
      : cloud.status === 'error'
        ? 'Erro ao sincronizar — toque para ver'
        : cloud.email ?? 'Conectado';
  return (
    <Screen>
      <T variant="title">Mais</T>
      <Card>
        <ListRow icon={cloud.status === 'error' ? 'cloud-alert-outline' : 'cloud-sync-outline'} title="Conta e sincronização" subtitle={cloudSubtitle} onPress={() => router.push('/nuvem')} />
      </Card>
      <Card>
        <ListRow icon="wallet-outline" title="Contas" subtitle={`${accounts.length} conta(s) · ${formatBRL(totalBalance(accounts, transactions))}`} onPress={() => router.push('/contas')} />
        <ListRow icon="shape-outline" title="Categorias" subtitle={`${categories.length} categorias`} onPress={() => router.push('/categorias')} />
      </Card>
      <Card>
        <ListRow icon="theme-light-dark" title="Aparência" subtitle={THEME_LABEL[preference]} onPress={() => router.push('/aparencia')} />
      </Card>
      <Card>
        <ListRow icon="database-import-outline" title="Importar do app antigo" subtitle="Traz os lançamentos do backup do Meu Financeiro 1.0" onPress={() => router.push('/importar')} />
      </Card>
      <Card>
        <T variant="label">Em breve</T>
        <T variant="caption">Cartão de crédito, orçamentos, metas e relatórios.</T>
      </Card>
      <T variant="caption" style={{ textAlign: 'center' }}>Live Finanças {Constants.expoConfig?.version ?? ''}</T>
    </Screen>
  );
}
