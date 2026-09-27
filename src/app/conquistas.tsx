import { View } from 'react-native';

import { Card, Icon, Screen, T } from '@/ui/components';
import { XpBar } from '@/ui/GamerProfile';
import { space, useColors } from '@/ui/theme';
import { useGame } from '@/ui/useGame';

export default function AchievementsScreen() {
  const c = useColors();
  const { game } = useGame();
  return (
    <Screen>
      <Card>
        <T variant="label" color={c.primaryText}>Nível {game.level}</T>
        <T variant="title">{game.title}</T>
        <XpBar into={game.into} need={game.need} />
        <T variant="caption">{game.into} / {game.need} XP para o próximo nível · maior sequência: {game.bestStreak} dias</T>
      </Card>

      <Card>
        <T variant="label">Conquistas</T>
        {game.achievements.map((a) => (
          <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: a.unlocked ? 1 : 0.5 }}>
            <View style={{ width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: a.unlocked ? c.primarySoft : c.surfaceAlt, borderWidth: 1, borderColor: a.unlocked ? c.primary : c.border }}>
              <Icon name={a.unlocked ? a.icon : 'lock-outline'} color={a.unlocked ? c.primaryText : c.muted} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="bodyStrong">{a.title}</T>
              <T variant="caption">{a.description}</T>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <T variant="label">De onde veio o seu XP</T>
        {game.breakdown.length ? (
          game.breakdown.map((l) => (
            <View key={l.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
              <T variant="body" style={{ flex: 1 }}>{l.label}</T>
              <T variant="bodyStrong" color={c.primaryText}>+{l.xp}</T>
            </View>
          ))
        ) : (
          <T variant="caption">Ainda nada: registre um lançamento hoje para começar.</T>
        )}
        <T variant="caption">XP vem de registrar em dia, fechar o mês dentro do orçamento, pagar as contas em dia, avançar nas metas e cumprir missões. Gastar nunca dá XP.</T>
      </Card>
    </Screen>
  );
}
