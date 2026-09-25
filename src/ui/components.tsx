import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Haptics from 'expo-haptics';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { monthLabel, shiftMonth, type MonthKey } from '@/domain/dates';
import { formatBRL } from '@/domain/money';
import type { Scope } from '@/domain/recurrence';
import type { EntryType } from '@/domain/types';
import { fonts, radius, space, useColors, useHideValues, type Colors, type FontWeightName } from './theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Toque leve de confirmação (só no celular). */
export function tapFeedback(kind: 'light' | 'success' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function cardShadow(c: Colors): ViewStyle {
  if (!c.shadowOpacity) return {};
  return { shadowColor: '#0E1116', shadowOpacity: c.shadowOpacity, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 2 };
}

export function Icon({ name, size = 22, color }: { name: string; size?: number; color?: string }) {
  const c = useColors();
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color ?? c.text} />;
}

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const c = useColors();
  const inner = padded ? { padding: space.xl, gap: space.lg, paddingBottom: 48 } : undefined;
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

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'amount';

const VARIANT: Record<TextVariant, { size: number; weight: FontWeightName; spacing?: number; upper?: boolean; muted?: boolean }> = {
  display: { size: 36, weight: 'extrabold', spacing: -1 },
  title: { size: 26, weight: 'extrabold', spacing: -0.5 },
  heading: { size: 17, weight: 'extrabold' },
  body: { size: 16, weight: 'regular' },
  bodyStrong: { size: 15, weight: 'semibold' },
  label: { size: 12, weight: 'bold', spacing: 0.6, upper: true, muted: true },
  caption: { size: 13, weight: 'medium', muted: true },
  amount: { size: 20, weight: 'extrabold', spacing: -0.3 },
};

export function T({
  children, variant = 'body', color, style, numberOfLines, weight,
}: { children: ReactNode; variant?: TextVariant; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number; weight?: FontWeightName }) {
  const c = useColors();
  const v = VARIANT[variant];
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontFamily: fonts[weight ?? v.weight], fontSize: v.size, letterSpacing: v.spacing ?? 0, color: color ?? (v.muted ? c.muted : c.text) },
        v.upper && { textTransform: 'uppercase' },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md }, cardShadow(c), style]}>
      {children}
    </View>
  );
}

/** Valor em reais; respeita o "esconder valores". */
export function Amount({ cents, type, size = 'bodyStrong', signed = false, color, hideable = true }: {
  cents: number; type?: EntryType; size?: TextVariant; signed?: boolean; color?: string; hideable?: boolean;
}) {
  const c = useColors();
  const hidden = useHideValues() && hideable;
  const tone = color ?? (type === 'income' ? c.income : type === 'expense' ? c.expense : c.text);
  const sign = signed && type ? (type === 'income' ? '+ ' : '− ') : '';
  return (
    <T variant={size} color={tone} weight={size === 'bodyStrong' ? 'bold' : undefined} style={{ fontVariant: ['tabular-nums'] }}>
      {hidden ? 'R$ •••••' : `${sign}${formatBRL(cents)}`}
    </T>
  );
}

export function Button({
  title, onPress, variant = 'primary', icon, disabled, style,
}: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: string; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const bg = { primary: c.primary, secondary: c.surfaceAlt, danger: 'transparent', ghost: 'transparent' }[variant];
  const fg = { primary: c.onPrimary, secondary: c.text, danger: c.danger, ghost: c.primaryText }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.md + 4, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, minHeight: 54 },
        variant === 'danger' && { borderWidth: 1.5, borderColor: c.danger },
        style,
      ]}>
      {icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontFamily: fonts.extrabold }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, tone }: { icon: string; label: string; onPress: () => void; tone?: 'surface' | 'hero' }) {
  const c = useColors();
  const bg = tone === 'hero' ? c.heroChip : c.surface;
  const fg = tone === 'hero' ? c.onHero : c.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, opacity: pressed ? 0.75 : 1 }, tone !== 'hero' && cardShadow(c)]}>
      <Icon name={icon} size={21} color={fg} />
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
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: selected ? accent : c.border, backgroundColor: selected ? accent + '22' : c.surface, minHeight: 42, opacity: pressed ? 0.8 : 1 })}>
      {icon ? <Icon name={icon} size={18} color={selected ? accent : c.muted} /> : null}
      <Text style={{ color: c.text, fontFamily: selected ? fonts.bold : fonts.medium, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string; color?: string }[]; value: V; onChange: (v: V) => void }) {
  const c = useColors();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md + 2, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: sel }} onPress={() => onChange(o.value)}
            style={[{ flex: 1, minHeight: 44, borderRadius: radius.md - 2, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? c.surface : 'transparent' }, sel && cardShadow(c)]}>
            <Text style={{ fontFamily: sel ? fonts.extrabold : fonts.semibold, fontSize: 15, color: sel ? (o.color ?? c.text) : c.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <T variant="caption" weight="bold">{label}</T>
      {children}
      {hint ? <T variant="caption">{hint}</T> : null}
    </View>
  );
}

export function Input(props: TextInputProps & { large?: boolean }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const { large, style, onFocus, onBlur, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={c.muted}
      selectionColor={c.primary}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      {...rest}
      style={[{ backgroundColor: c.surface, borderWidth: 1.5, borderColor: focused ? c.primary : c.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: large ? 14 : 12, fontSize: large ? 28 : 16, fontFamily: large ? fonts.extrabold : fonts.regular, color: c.text, minHeight: 52 }, style]}
    />
  );
}

export function SwitchRow({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: 14, borderRadius: radius.md + 2, backgroundColor: c.surface }, cardShadow(c)]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong" weight="bold">{title}</T>
        {subtitle ? <T variant="caption">{subtitle}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary, false: c.border }} thumbColor="#FFFFFF" />
    </Pressable>
  );
}

export function ListRow({ icon, iconColor, title, subtitle, right, onPress }: { icon?: string; iconColor?: string; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  const c = useColors();
  const tint = iconColor ?? c.primary;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6, opacity: pressed ? 0.7 : 1, minHeight: 52 })}>
      {icon ? (
        <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: tint + '22' }}>
          <Icon name={icon} size={21} color={iconColor ?? c.primaryText} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong" numberOfLines={1}>{title}</T>
        {subtitle ? <T variant="caption" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
      {onPress && !right ? <Icon name="chevron-right" color={c.muted} /> : null}
    </Pressable>
  );
}

export function MonthSwitcher({ month, onChange }: { month: MonthKey; onChange: (m: MonthKey) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <IconButton icon="chevron-left" label="Mês anterior" onPress={() => onChange(shiftMonth(month, -1))} />
      <T variant="heading">{monthLabel(month)}</T>
      <IconButton icon="chevron-right" label="Próximo mês" onPress={() => onChange(shiftMonth(month, 1))} />
    </View>
  );
}

export function Pill({ label, tone = 'warning' }: { label: string; tone?: 'warning' | 'primary' | 'hero' }) {
  const c = useColors();
  const bg = tone === 'warning' ? c.warningSoft : tone === 'primary' ? c.primarySoft : c.heroChip;
  const fg = tone === 'warning' ? c.warning : tone === 'primary' ? c.primaryText : c.onHero;
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: bg }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: fg }}>{label}</Text>
    </View>
  );
}

export function Empty({ icon, title, text }: { icon: string; title: string; text?: string }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.sm }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft }}>
        <Icon name={icon} size={30} color={c.primaryText} />
      </View>
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
        <Pressable style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, gap: space.sm, paddingBottom: space.xxl }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: space.sm }} />
          <T variant="heading">{title}</T>
          {opts.map((o) => (
            <Pressable key={o.scope} onPress={() => onPick(o.scope)} style={({ pressed }) => ({ padding: space.md, borderRadius: radius.md, backgroundColor: pressed ? c.surfaceAlt : 'transparent' })}>
              <T variant="bodyStrong">{o.label}</T>
              {o.hint ? <T variant="caption">{o.hint}</T> : null}
            </Pressable>
          ))}
          <Button title="Cancelar" variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const hairline = StyleSheet.hairlineWidth;
