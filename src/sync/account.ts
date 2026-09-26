/**
 * Isolamento entre contas no aparelho: o que fazer com os dados locais ao
 * entrar e ao sair de uma conta. Separado das telas para ser testado com SQL de verdade.
 *
 * Regras (decididas pelo João):
 * - sair da conta apaga os dados financeiros do celular (ficam na nuvem);
 * - entrar numa conta diferente da dona dos dados do celular apaga antes (nunca mistura);
 * - dados criados sem conta (celular sem dono) sobem para a conta na primeira entrada.
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getMeta, seedIfEmpty, setMeta, wipeLocalData } from '@/db/repo';
import { SYNC_USER_KEY, markAllDirty, resetSyncCursors } from '@/db/syncStore';

export type SignInAction =
  /** o celular já é desta conta: só sincroniza */
  | 'continue'
  /** celular sem dono: o que existe aqui sobe para a conta */
  | 'adopt-local'
  /** celular com dados de OUTRA conta: apaga e baixa os da conta que entrou */
  | 'wipe-other';

export function decideSignIn(deviceOwner: string | null, userId: string): SignInAction {
  if (!deviceOwner) return 'adopt-local';
  return deviceOwner === userId ? 'continue' : 'wipe-other';
}

/** Prepara o aparelho para a conta que acabou de entrar. Devolve o que foi feito. */
export async function prepareDeviceForUser(db: SQLiteDatabase, userId: string, newId: () => string): Promise<SignInAction> {
  const action = decideSignIn(await getMeta(db, SYNC_USER_KEY), userId);
  if (action === 'wipe-other') {
    await wipeLocalData(db);
    await seedIfEmpty(db, newId);
  } else if (action === 'adopt-local') {
    await resetSyncCursors(db);
    await markAllDirty(db);
  }
  if (action !== 'continue') await setMeta(db, SYNC_USER_KEY, userId);
  return action;
}

/** Depois de sair da conta: nada da pessoa fica no aparelho (só as preferências do celular). */
export async function clearDeviceAfterSignOut(db: SQLiteDatabase, newId: () => string) {
  await wipeLocalData(db);
  await seedIfEmpty(db, newId);
}
