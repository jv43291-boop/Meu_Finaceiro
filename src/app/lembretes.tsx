import { Linking, View } from 'react-native';

import { useReminders } from '@/state/reminders';
import { Button, Card, Chip, Empty, Screen, SwitchRow, T } from '@/ui/components';
import { notify } from '@/ui/dialogs';
import { space } from '@/ui/theme';

const DAYS = [
  { value: 0, label: 'No dia' },
  { value: 1, label: '1 dia antes' },
  { value: 2, label: '2 dias antes' },
  { value: 3, label: '3 dias antes' },
];
const HOURS = [7, 8, 9, 10, 12, 18, 20];

function when(d: Date): string {
  const date = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${date} às ${String(d.getHours()).padStart(2, '0')}h`;
}

export default function RemindersScreen() {
  const r = useReminders();
  const s = r.settings;

  if (!r.supported) {
    return (
      <Screen>
        <Card>
          <Empty icon="bell-off-outline" title="Só no celular" text="Os lembretes usam as notificações do Android/iPhone. Abra o Live no celular para ligar." />
        </Card>
      </Screen>
    );
  }

  async function toggle(on: boolean) {
    const ok = await r.update({ enabled: on });
    if (!ok) {
      await notify('Notificações bloqueadas', 'Para receber os lembretes, permita as notificações do Live nas configurações do celular.');
    }
  }

  const blocked = s.enabled && r.permission === 'denied';

  return (
    <Screen>
      <SwitchRow
        title="Avisar vencimentos"
        subtitle="Contas, fixos e faturas de cartão que ainda não foram pagos"
        value={s.enabled}
        onChange={toggle}
      />

      {blocked ? (
        <Card>
          <T variant="bodyStrong">As notificações estão desligadas no celular</T>
          <T variant="caption">Sem essa permissão os lembretes não aparecem.</T>
          <Button title="Abrir configurações" variant="secondary" icon="cog-outline" onPress={() => Linking.openSettings()} />
        </Card>
      ) : null}

      {s.enabled ? (
        <>
          <Card>
            <T variant="label">Quando avisar</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {DAYS.map((d) => (
                <Chip key={d.value} label={d.label} selected={s.daysBefore === d.value} onPress={() => r.update({ daysBefore: d.value })} />
              ))}
            </View>
            <T variant="label" style={{ paddingTop: space.sm }}>Horário</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {HOURS.map((h) => (
                <Chip key={h} label={`${String(h).padStart(2, '0')}:00`} selected={s.hour === h} onPress={() => r.update({ hour: h })} />
              ))}
            </View>
          </Card>

          <SwitchRow
            title="Mostrar o valor no aviso"
            subtitle="Desligado, ninguém vê quanto você deve na tela bloqueada"
            value={s.showAmounts}
            onChange={(v) => r.update({ showAmounts: v })}
          />

          <Card>
            <T variant="label">Agendados</T>
            <T variant="bodyStrong">
              {r.scheduled === 0 ? 'Nenhum vencimento em aberto nos próximos 30 dias' : r.scheduled === 1 ? '1 aviso nos próximos 30 dias' : `${r.scheduled} avisos nos próximos 30 dias`}
            </T>
            {r.nextAt ? <T variant="caption">Próximo: {when(r.nextAt)}</T> : null}
            <T variant="caption">Contas do mesmo dia chegam juntas num aviso só. Marcou como pago, o aviso some.</T>
            <Button title="Enviar um aviso de teste" variant="secondary" icon="bell-ring-outline" onPress={r.sendTest} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
