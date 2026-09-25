/**
 * Agenda os lembretes de vencimento como notificações LOCAIS do celular.
 * Não usa servidor nem push: o próprio aparelho dispara na hora marcada,
 * mesmo com o app fechado e sem internet.
 *
 * Sempre que os dados mudam, o app volta para a frente ou a configuração muda,
 * cancela os avisos do Live e agenda de novo os próximos 30 dias.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { getMeta, setMeta } from '@/db/repo';
import { DEFAULT_REMINDERS, parseReminderSettings, planReminders, type ReminderSettings } from '@/domain/reminders';
import { useFinance } from './finance';

const KEY = 'reminders';
const CHANNEL = 'vencimentos';
const PREFIX = 'live-venc-';
export const remindersSupported = Platform.OS !== 'web';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

interface RemindersValue {
  supported: boolean;
  settings: ReminderSettings;
  permission: PermissionState;
  /** quantos avisos estão agendados agora */
  scheduled: number;
  nextAt: Date | null;
  /** salva; ao ligar, pede a permissão. Devolve false se o usuário negou. */
  update: (patch: Partial<ReminderSettings>) => Promise<boolean>;
  sendTest: () => Promise<void>;
}

const Ctx = createContext<RemindersValue | null>(null);

if (remindersSupported) {
  // com o app aberto, mostra o aviso mesmo assim
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Vencimentos',
    description: 'Avisos de contas e faturas que vão vencer',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#5B45FF',
  });
}

async function readPermission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

export function RemindersProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { ready, transactions, recurrences, cards } = useFinance();
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [scheduled, setScheduled] = useState(0);
  const [nextAt, setNextAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const running = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    getMeta(db, KEY)
      .then((raw) => setSettings(parseReminderSettings(raw)))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
    if (remindersSupported) readPermission().then(setPermission).catch(() => undefined);
  }, [db]);

  // volta para a frente: reagenda (o dia pode ter virado) e relê a permissão
  useEffect(() => {
    if (!remindersSupported) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      setTick((t) => t + 1);
      readPermission().then(setPermission).catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  // tocar no aviso abre o extrato
  useEffect(() => {
    if (!remindersSupported) return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      if (r.notification.request.identifier.startsWith(PREFIX)) router.navigate('/lancamentos');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!remindersSupported || !ready || !loaded) return;
    const handle = setTimeout(() => {
      // em fila: nunca duas reprogramações ao mesmo tempo
      running.current = running.current.then(async () => {
        try {
          const existing = await Notifications.getAllScheduledNotificationsAsync();
          await Promise.all(existing.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
          const granted = (await readPermission()) === 'granted';
          const plan = granted ? planReminders({ transactions, recurrences, cards }, settings, new Date()) : [];
          if (plan.length) await ensureChannel();
          for (const r of plan) {
            await Notifications.scheduleNotificationAsync({
              identifier: r.id,
              content: { title: r.title, body: r.body, data: { dueDate: r.dueDate } },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.fireAt, channelId: CHANNEL },
            });
          }
          setScheduled(plan.length);
          setNextAt(plan[0]?.fireAt ?? null);
        } catch {
          // lembrete é um extra: se o sistema recusar, o app segue normal
        }
      });
    }, 1500);
    return () => clearTimeout(handle);
  }, [ready, loaded, settings, transactions, recurrences, cards, tick]);

  const update = useCallback(
    async (patch: Partial<ReminderSettings>) => {
      const next = { ...settings, ...patch };
      if (patch.enabled && remindersSupported) {
        let p = await Notifications.getPermissionsAsync();
        if (!p.granted && p.canAskAgain) {
          await ensureChannel(); // no Android 13+ o pedido só aparece depois de existir um canal
          p = await Notifications.requestPermissionsAsync();
        }
        setPermission(p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied');
        if (!p.granted) return false;
      }
      setSettings(next);
      await setMeta(db, KEY, JSON.stringify(next));
      return true;
    },
    [db, settings],
  );

  const sendTest = useCallback(async () => {
    if (!remindersSupported) return;
    await ensureChannel();
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Lembretes do Live ligados', body: 'É assim que o aviso de vencimento vai aparecer.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId: CHANNEL },
    });
  }, []);

  const value = useMemo<RemindersValue>(
    () => ({ supported: remindersSupported, settings, permission, scheduled, nextAt, update, sendTest }),
    [settings, permission, scheduled, nextAt, update, sendTest],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReminders(): RemindersValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useReminders precisa estar dentro de RemindersProvider');
  return v;
}
