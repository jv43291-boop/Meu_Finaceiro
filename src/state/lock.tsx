/**
 * Bloqueio com digital / rosto (ou o PIN/padrão do celular como alternativa).
 * Tudo acontece no aparelho: o Live nunca vê nem guarda a digital, só recebe
 * do sistema "autenticou" ou "não autenticou".
 *
 * Pede ao abrir o app e quando ele volta depois de mais de 1 minuto em segundo plano.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { getMeta, setMeta } from '@/db/repo';
import { Button, Icon, T } from '@/ui/components';
import { space, useColors } from '@/ui/theme';

const KEY = 'lock_enabled';
const RELOCK_AFTER_MS = 60_000;
const lockSupported = Platform.OS !== 'web';

interface LockValue {
  /** o celular tem sensor e alguma digital/rosto cadastrado */
  available: boolean;
  /** tem sensor mas nada cadastrado nas configurações do celular */
  notEnrolled: boolean;
  enabled: boolean;
  /** "digital", "rosto" ou "digital ou rosto" */
  methodLabel: string;
  /** liga/desliga; sempre confirma com a digital antes. Devolve se mudou. */
  setEnabled: (on: boolean) => Promise<boolean>;
}

const Ctx = createContext<LockValue | null>(null);

function labelFor(types: LocalAuthentication.AuthenticationType[]): string {
  const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  if (finger && face) return 'digital ou rosto';
  if (face) return 'rosto';
  return 'digital';
}

async function authenticate(message: string): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: message,
    cancelLabel: 'Cancelar',
    fallbackLabel: 'Usar senha do celular',
    disableDeviceFallback: false,
  });
  return r.success;
}

export function LockProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [loaded, setLoaded] = useState(!lockSupported);
  const [enabled, setEnabledState] = useState(false);
  const [available, setAvailable] = useState(false);
  const [notEnrolled, setNotEnrolled] = useState(false);
  const [methodLabel, setMethodLabel] = useState('digital');
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const backgroundAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    setBusy(true);
    try {
      if (await authenticate('Desbloquear o Live')) setLocked(false);
    } catch {
      // sensor indisponível no momento: continua bloqueado, o botão tenta de novo
    } finally {
      prompting.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!lockSupported) return;
    (async () => {
      try {
        const [hw, enrolled, types, saved] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
          getMeta(db, KEY),
        ]);
        setAvailable(hw && enrolled);
        setNotEnrolled(hw && !enrolled);
        setMethodLabel(labelFor(types));
        // se a digital foi removida do celular, não prende a pessoa fora do app
        const on = saved === '1' && hw && enrolled;
        setEnabledState(on);
        setLocked(on);
        if (on) void unlock();
      } catch {
        // sem suporte: segue sem bloqueio
      } finally {
        setLoaded(true);
      }
    })();
  }, [db, unlock]);

  useEffect(() => {
    if (!lockSupported || !enabled) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') backgroundAt.current = Date.now();
      if (s === 'active') {
        const away = backgroundAt.current ? Date.now() - backgroundAt.current : 0;
        backgroundAt.current = null;
        if (away > RELOCK_AFTER_MS) {
          setLocked(true);
          void unlock();
        }
      }
    });
    return () => sub.remove();
  }, [enabled, unlock]);

  const setEnabled = useCallback(
    async (on: boolean) => {
      if (!lockSupported || (on && !available)) return false;
      const ok = await authenticate(on ? `Confirme sua ${methodLabel} para ligar o bloqueio` : 'Confirme para desligar o bloqueio').catch(() => false);
      if (!ok) return false;
      await setMeta(db, KEY, on ? '1' : '0');
      setEnabledState(on);
      return true;
    },
    [available, db, methodLabel],
  );

  const value = useMemo<LockValue>(() => ({ available, notEnrolled, enabled, methodLabel, setEnabled }), [available, notEnrolled, enabled, methodLabel, setEnabled]);

  return (
    <Ctx.Provider value={value}>
      {loaded ? children : null}
      {locked ? <LockScreen busy={busy} methodLabel={methodLabel} onUnlock={unlock} /> : null}
    </Ctx.Provider>
  );
}

function LockScreen({ busy, methodLabel, onUnlock }: { busy: boolean; methodLabel: string; onUnlock: () => void }) {
  const c = useColors();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg }]}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={methodLabel === 'rosto' ? 'face-recognition' : 'fingerprint'} size={36} color={c.primary} />
      </View>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <T variant="title">Live bloqueado</T>
        <T variant="caption" style={{ textAlign: 'center' }}>Use sua {methodLabel} ou a senha do celular para ver seus dados.</T>
      </View>
      <Button title={busy ? 'Aguardando…' : 'Desbloquear'} icon="lock-open-variant-outline" onPress={onUnlock} disabled={busy} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

export function useLock(): LockValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLock precisa estar dentro de LockProvider');
  return v;
}
