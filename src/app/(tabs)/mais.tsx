import Constants from 'expo-constants';
import { router } from 'expo-router';

import { formatBRL } from '@/domain/money';
import { totalBalance } from '@/domain/summary';
import { useCloud } from '@/state/cloud';
import { useFinance } from '@/state/finance';
import { useLock } from '@/state/lock';
import { useReminders } from '@/state/reminders';
import { Card, ListRow, Screen, T } from '@/ui/components';
import { useAppTheme } from '@/ui/theme';

const THEME_LABEL = { system: 'Automático (segue o celular)', light: 'Claro', dark: 'Escuro' } as const;

export default function MoreScreen() {
  const { accounts, categories, transactions, cards, goals, payeeRules } = useFinance();
  const { preference } = useAppTheme();
  const cloud = useCloud();
  const reminders = useReminders();
  const lock = useLock();
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
        <ListRow icon="receipt-text-outline" title="Lançar comprovante de Pix" subtitle="Lê o print ou PDF e desconta do saldo" onPress={() => router.push('/comprovante')} />
        <ListRow icon="account-switch-outline" title="Regras de recebedores" subtitle={payeeRules.length ? `${payeeRules.length} regra(s) · ex.: José Ribeiro = Compra de pão` : 'Troque o nome da pessoa pelo que foi o gasto'} onPress={() => router.push('/recebedores')} />
      </Card>
      <Card>
        <ListRow icon="chart-box-outline" title="Relatórios" subtitle="Gastos por categoria e evolução mensal" onPress={() => router.push('/relatorios')} />
        <ListRow icon="gauge" title="Orçamentos" subtitle="Limite por categoria, com aviso" onPress={() => router.push('/orcamentos')} />
        <ListRow icon="piggy-bank-outline" title="Metas" subtitle={goals.length ? `${goals.filter((g) => !g.archived).length} meta(s)` : 'Junte dinheiro para um objetivo'} onPress={() => router.push('/metas')} />
      </Card>
      <Card>
        <ListRow icon="wallet-outline" title="Contas" subtitle={`${accounts.length} conta(s) · ${formatBRL(totalBalance(accounts, transactions))}`} onPress={() => router.push('/contas')} />
        <ListRow icon="credit-card-outline" title="Cartões" subtitle={cards.length ? `${cards.filter((k) => !k.archived).length} cartão(ões)` : 'Cadastre para controlar faturas'} onPress={() => router.push('/cartoes')} />
        <ListRow icon="shape-outline" title="Categorias" subtitle={`${categories.length} categorias`} onPress={() => router.push('/categorias')} />
      </Card>
      <Card>
        <ListRow icon="bell-outline" title="Lembretes" subtitle={reminders.supported ? (reminders.settings.enabled ? `Ligado · ${reminders.scheduled} aviso(s) agendado(s)` : 'Aviso antes de cada vencimento') : 'Disponível no celular'} onPress={() => router.push('/lembretes')} />
        <ListRow icon="fingerprint" title="Bloqueio do app" subtitle={lock.enabled ? `Ligado · pede ${lock.methodLabel}` : 'Proteja com digital ou rosto'} onPress={() => router.push('/seguranca')} />
        <ListRow icon="file-delimited-outline" title="Exportar para planilha" subtitle="CSV para Excel ou Google Planilhas" onPress={() => router.push('/exportar')} />
      </Card>
      <Card>
        <ListRow icon="palette-outline" title="Personalizar" subtitle={`Foto de fundo, cor e tema · ${THEME_LABEL[preference]}`} onPress={() => router.push('/aparencia')} />
      </Card>
      <Card>
        <ListRow icon="database-import-outline" title="Importar do app antigo" subtitle="Traz os lançamentos do backup do Meu Financeiro 1.0" onPress={() => router.push('/importar')} />
      </Card>
      <T variant="caption" style={{ textAlign: 'center' }}>Live Finanças {Constants.expoConfig?.version ?? ''}</T>
    </Screen>
  );
}
