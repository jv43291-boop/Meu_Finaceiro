import { Platform } from 'react-native';

import { useLock } from '@/state/lock';
import { Card, Empty, Screen, SwitchRow, T } from '@/ui/components';

export default function SecurityScreen() {
  const lock = useLock();

  if (Platform.OS === 'web') {
    return (
      <Screen>
        <Card>
          <Empty icon="fingerprint-off" title="Só no celular" text="O bloqueio usa a digital ou o rosto cadastrados no celular." />
        </Card>
      </Screen>
    );
  }

  if (!lock.available) {
    return (
      <Screen>
        <Card>
          <Empty
            icon="fingerprint-off"
            title={lock.notEnrolled ? 'Nenhuma digital cadastrada' : 'Sem sensor biométrico'}
            text={
              lock.notEnrolled
                ? 'Cadastre uma digital ou o rosto nas configurações do celular e volte aqui para ligar o bloqueio.'
                : 'Este celular não tem leitor de digital nem reconhecimento de rosto disponível.'
            }
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <SwitchRow
        title={`Pedir ${lock.methodLabel} para abrir`}
        subtitle="Ao abrir o Live e ao voltar depois de 1 minuto fora"
        value={lock.enabled}
        onChange={(v) => void lock.setEnabled(v)}
      />
      <Card>
        <T variant="label">Como funciona</T>
        <T variant="caption">A verificação é feita pelo próprio celular: o Live não vê nem guarda sua digital. Se o sensor falhar, dá para usar o PIN, padrão ou senha do celular.</T>
      </Card>
    </Screen>
  );
}
