import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';

import { XP } from '@/domain/gamification';
import { Button, Card, Icon, T, tapFeedback } from './components';
import { confirmAsk, notify } from './dialogs';
import { space, useColors } from './theme';
import { useGame } from './useGame';

/** Barra contínua de XP até o próximo nível. */
export function XpBar({ into, need }: { into: number; need: number }) {
  const c = useColors();
  const pct = need > 0 ? Math.min(1, into / need) : 0;
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: need, now: into }} style={{ height: 12, borderRadius: 2, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: c.primary }} />
    </View>
  );
}

/** Card do modo gamer na Início: nível, XP, sequência e missões do mês. */
export function GamerProfile() {
  const c = useColors();
  const { game, checkIn, seen, markSeen } = useGame();

  // comemora uma vez ao subir de nível ou liberar conquista (na primeira vez só registra, sem avalanche)
  useEffect(() => {
    if (seen === undefined) return;
    const unlocked = game.achievements.filter((a) => a.unlocked).map((a) => a.id);
    if (seen === null) {
      markSeen({ level: game.level, badges: unlocked });
      return;
    }
    const fresh = game.achievements.filter((a) => a.unlocked && !seen.badges.includes(a.id));
    const up = game.level > seen.level;
    if (!up && !fresh.length) return;
    markSeen({ level: Math.max(seen.level, game.level), badges: [...new Set([...seen.badges, ...unlocked])] });
    tapFeedback('success');
    const lines = [
      up ? `Você chegou ao nível ${game.level} — ${game.title}!` : null,
      ...fresh.map((a) => `🏆 ${a.title}: ${a.description}`),
    ].filter(Boolean);
    notify(up ? 'Subiu de nível!' : 'Conquista liberada!', lines.join('\n'));
  }, [game.level, game.achievements, game.title, seen, markSeen]);

  async function noSpend() {
    const ok = await confirmAsk('Hoje não gastei', 'Nenhuma compra hoje, nem pequena? Marcar mantém a sua sequência.', 'Não gastei');
    if (!ok) return;
    await checkIn();
    tapFeedback('success');
  }

  return (
    <Card style={{ borderWidth: 2, borderColor: c.primary }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <View style={{ gap: 2, flex: 1 }}>
          <T variant="label" color={c.primaryText}>Nível {game.level}</T>
          <T variant="heading">{game.title}</T>
        </View>
        <View style={{ alignItems: 'center' }} accessibilityLabel={`Sequência de ${game.streak} dias`}>
          <Icon name="fire" size={26} color={game.streak ? c.spark : c.muted} />
          <T variant="caption" weight="bold" color={game.streak ? c.spark : undefined}>{game.streak} {game.streak === 1 ? 'dia' : 'dias'}</T>
        </View>
      </View>
      <XpBar into={game.into} need={game.need} />
      <T variant="caption">{game.into} / {game.need} XP para o nível {game.level + 1} · total {game.xp} XP</T>

      {!game.todayActive ? (
        <Button title="Hoje não gastei" icon="shield-check-outline" variant="secondary" onPress={noSpend} />
      ) : null}

      <T variant="label">Missões do mês · +{XP.mission} XP cada</T>
      {game.missions.map((m) => (
        <View key={m.kind} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name={m.done ? 'check-decagram' : m.final ? 'close-octagon-outline' : 'sword-cross'} size={18} color={m.done ? c.income : m.final ? c.danger : c.primaryText} />
            <T variant="bodyStrong" style={{ flex: 1 }}>{m.title}</T>
          </View>
          <View style={{ height: 6, borderRadius: 1, backgroundColor: c.surfaceAlt, marginLeft: 26 }}>
            <View style={{ width: `${m.progress * 100}%`, height: 6, borderRadius: 1, backgroundColor: m.done ? c.income : m.kind === 'register' || m.kind === 'bills' ? c.primary : m.progress >= 1 ? c.danger : c.warning }} />
          </View>
          <T variant="caption" style={{ marginLeft: 26 }}>{m.done ? 'cumprida' : m.final ? 'não deu desta vez' : m.detail}</T>
        </View>
      ))}

      <Pressable onPress={() => router.push('/conquistas')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 4 }}>
        <Icon name="trophy-outline" color={c.primaryText} />
        <T variant="bodyStrong" color={c.primaryText} style={{ flex: 1 }}>
          Conquistas · {game.achievements.filter((a) => a.unlocked).length}/{game.achievements.length}
        </T>
        <Icon name="chevron-right" color={c.muted} />
      </Pressable>
    </Card>
  );
}
