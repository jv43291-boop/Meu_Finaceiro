import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { monthLabel, shiftMonth, type MonthKey } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import type { Scope } from '@/domain/recurrence';
import type { EntryType } from '@/domain/types';
import { radius, space, useColors } from './theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color }: { name: string; size?: number; color?: string }) {
  const c = useColors();
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color ?? c.text} />;
}

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const c = useColors();
  const inner = padded ? { padding: space.lg, gap: space.lg, paddingBottom: 120 } : undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

type TextVariant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'amount';

export function T({
  children, variant = 'body', color, style, numberOfLines,
}: { children: ReactNode; variant?: TextVariant; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const c = useColors();
  return (
    <Text numberOfLines={numberOfLines} style={[styles[variant], { color: color ?? (variant === 'caption' || variant === 'label' ? c.muted : c.text) }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, style]}>
      {children}
    </View>
  );
}

export function Amount({ cents, type, size = 'body', signed = false, muted = false }: {
  cents: number; type?: EntryType; size?: 'body' | 'amount' | 'title'; signed?: boolean; muted?: boolean;
}) {
  const c = useColors();
  const color = muted ? c.muted : type === 'income' ? c.income : type === 'expense' ? c.expense : c.text;
  const sign = signed && type ? (type === 'income' ? '+ ' : '− ') : '';
  return (
    <T variant={size} color={color} style={{ fontVariant: ['tabular-nums'] }}>
      {sign}{formatBRL(cents)}
    </T>
  );
}

export function Button({
  title, onPress, variant = 'primary', icon, disabled, style,
}: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: string; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const bg = { primary: c.primary, secondary: c.surfaceAlt, danger: 'transparent', ghost: 'transparent' }[variant];
  const fg = { primary: '#FFFFFF', secondary: c.text, danger: c.danger, ghost: c.primaryDark }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, opacity: disabled ? 0.5 : pressed ? 0.8 : 1, minHeight: 48 },
        variant === 'danger' && { borderWidth: 1, borderColor: c.danger },
        style,
      ]}>
      {icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, color }: { label: string; selected: boolean; onPress: () => void; icon?: string; color?: string }) {
  const c = useColors();
  const accent = color ?? c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? accent : c.border, backgroundColor: selected ? accent + '22' : c.surface, minHeight: 40 }}>
      {icon ? <Icon name={icon} size={18} color={selected ? accent : c.muted} /> : null}
      <Text style={{ color: selected ? c.text : c.muted, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string; color?: string }[]; value: V; onChange: (v: V) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 4 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: sel }} onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center', backgroundColor: sel ? c.surface : 'transparent' }}>
            <Text style={{ fontWeight: '600', color: sel ? (o.color ?? c.text) : c.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      {children}
      {hint ? <T variant="caption">{hint}</T> : null}
    </View>
  );
}

export function Input(props: TextInputProps & { large?: boolean }) {
  const c = useColors();
  const { large, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...rest}
      style={[{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: large ? 14 : 12, fontSize: large ? 28 : 16, fontWeight: large ? '700' : '400', color: c.text, minHeight: 48 }, style]}
    />
  );
}

export function SwitchRow({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 }}>
      <View style={{ flex: 1 }}>
        <T style={{ fontWeight: '600' }}>{title}</T>
        {subtitle ? <T variant="caption">{subtitle}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary, false: c.border }} thumbColor="#FFFFFF" />
    </Pressable>
  );
}

export function ListRow({ icon, iconColor, title, subtitle, right, onPress }: { icon?: string; iconColor?: string; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, opacity: pressed ? 0.7 : 1, minHeight: 48 })}>
      {icon ? (
        <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: (iconColor ?? c.primary) + '22' }}>
          <Icon name={icon} size={20} color={iconColor ?? c.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T numberOfLines={1} style={{ fontWeight: '500' }}>{title}</T>
        {subtitle ? <T variant="caption" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
      {onPress && !right ? <Icon name="chevron-right" color={c.muted} /> : null}
    </Pressable>
  );
}

export function MonthSwitcher({ month, onChange }: { month: MonthKey; onChange: (m: MonthKey) => void }) {
  const c = useColors();
  const btn = { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surface };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable accessibilityLabel="Mês anterior" onPress={() => onChange(shiftMonth(month, -1))} style={btn}>
        <Icon name="chevron-left" />
      </Pressable>
      <T variant="heading">{monthLabel(month)}</T>
      <Pressable accessibilityLabel="Próximo mês" onPress={() => onChange(shiftMonth(month, 1))} style={btn}>
        <Icon name="chevron-right" />
      </Pressable>
    </View>
  );
}

export function Fab({ onPress, label = 'Novo lançamento' }: { onPress: () => void; label?: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ position: 'absolute', right: space.lg, bottom: space.xl, width: 60, height: 60, borderRadius: 30, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, opacity: pressed ? 0.85 : 1 })}>
      <Icon name="plus" size={30} color="#FFFFFF" />
    </Pressable>
  );
}

export function Empty({ icon, title, text }: { icon: string; title: string; text?: string }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.sm }}>
      <Icon name={icon} size={40} color={c.muted} />
      <T variant="heading" style={{ textAlign: 'center' }}>{title}</T>
      {text ? <T variant="caption" style={{ textAlign: 'center' }}>{text}</T> : null}
    </View>
  );
}

/** Pergunta o alcance de uma edição/exclusão numa recorrência ou parcelamento. */
export function ScopeSheet({ visible, title, onPick, onClose, kind }: {
  visible: boolean; title: string; kind: 'recurrence' | 'installments'; onPick: (s: Scope) => void; onClose: () => void;
}) {
  const c = useColors();
  const opts: { scope: Scope; label: string; hint: string }[] = kind === 'recurrence'
    ? [
        { scope: 'this', label: 'Só este mês', hint: 'Os outros meses continuam iguais.' },
        { scope: 'future', label: 'Este e os próximos', hint: 'Meses anteriores não mudam.' },
        { scope: 'all', label: 'Todos os meses', hint: 'O que já foi pago continua como estava.' },
      ]
    : [
        { scope: 'this', label: 'Só esta parcela', hint: '' },
        { scope: 'future', label: 'Esta e as próximas', hint: '' },
        { scope: 'all', label: 'Todas as parcelas', hint: '' },
      ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.sm, paddingBottom: space.xxl }}>
          <T variant="heading">{title}</T>
          {opts.map((o) => (
            <Pressable key={o.scope} onPress={() => onPick(o.scope)} style={({ pressed }) => ({ padding: space.md, borderRadius: radius.md, backgroundColor: pressed ? c.surfaceAlt : 'transparent' })}>
              <T style={{ fontWeight: '600' }}>{o.label}</T>
              {o.hint ? <T variant="caption">{o.hint}</T> : null}
            </Pressable>
          ))}
          <Button title="Cancelar" variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  caption: { fontSize: 13 },
  amount: { fontSize: 22, fontWeight: '700' },
});
