import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';

import { useFinance } from '@/state/finance';
import { Button, Card, Input, Screen, T } from '@/ui/components';
import { confirmAsk, notify } from '@/ui/dialogs';
import { goBack } from '@/ui/nav';

export default function ImportScreen() {
  const f = useFinance();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function runImport(raw: string) {
    setBusy(true);
    try {
      const r = await f.importOldApp(raw);
      await notify(
        'Importação concluída',
        `${r.stats.entries} lançamento(s) lidos: ${r.stats.recurrences} viraram recorrências mensais e ${r.stats.transactions} ficaram como lançamentos.` +
          (r.stats.skipped ? `\n${r.stats.skipped} ignorado(s) por estarem incompletos.` : ''),
      );
      goBack();
    } catch (e) {
      notify('Não foi possível importar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(raw: string) {
    const ok = await confirmAsk('Importar dados?', 'Os lançamentos do app antigo serão somados aos que já estão aqui. Faça isso uma vez só para não duplicar.', 'Importar');
    if (ok) await runImport(raw);
  }

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      confirm(await new File(res.assets[0].uri).text());
    } catch (e) {
      notify('Não foi possível ler o arquivo', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen>
      <Card>
        <T variant="heading">Trazer dados do Meu Financeiro 1.0</T>
        <T variant="caption">
          Use o arquivo JSON do backup antigo (o conteúdo de “payload” da tabela finance_backups). Lançamentos marcados como
          recorrentes viram recorrências mensais de verdade, que aparecem sozinhas nos meses seguintes.
        </T>
        <Button title="Escolher arquivo JSON" icon="file-upload-outline" onPress={pickFile} disabled={busy} />
      </Card>
      <Card>
        <T variant="label">Ou cole o JSON aqui</T>
        <Input value={text} onChangeText={setText} multiline placeholder='{"entries": [...]}' style={{ minHeight: 140, textAlignVertical: 'top', fontSize: 13 }} />
        <Button title="Importar texto colado" variant="secondary" onPress={() => confirm(text)} disabled={busy || !text.trim()} />
      </Card>
    </Screen>
  );
}
