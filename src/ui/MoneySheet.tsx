import { useState } from 'react';
import { Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatPlain, parseMoney } from '@/domain/money';
import { Button, Field, Input, T } from './components';
import { notify } from './dialogs';
import { radius, space, useColors } from './theme';

/** Folha de baixo para digitar um valor (orçamento, guardar/retirar da meta). */
export function MoneySheet({ visible, title, hint, initialCents, confirmLabel, allowEmpty, extra, onConfirm, onClose }: {
  visible: boolean;
  title: string;
  hint?: string;
  initialCents: number | null;
  confirmLabel: string;
  /** vazio = remover (ex.: tirar o orçamento) */
  allowEmpty?: boolean;
  extra?: React.ReactNode;
  onConfirm: (cents: number | null) => Promise<void> | void;
  onClose: () => void;
}) {
  const c = useColors();
  const sheetBottom = useSafeAreaInsets().bottom;
  const [text, setText] = useState('');
  async function confirm() {
    if (!text.trim() && allowEmpty) return onConfirm(null);
    const cents = parseMoney(text);
    if (cents === null || cents <= 0) return notify('Revise o valor', 'Informe um valor maior que zero, por exemplo 450,00.');
    await onConfirm(cents);
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={() => setText(initialCents ? formatPlain(initialCents) : '')}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, gap: space.lg, paddingBottom: space.xxl + sheetBottom }}>
          <T variant="heading">{title}</T>
          <Field label="Valor (R$)" hint={hint}>
            <Input large value={text} onChangeText={setText} placeholder="0,00" keyboardType="decimal-pad" autoFocus />
          </Field>
          {extra}
          <Button title={confirmLabel} icon="check" onPress={confirm} />
          <Button title="Cancelar" variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
