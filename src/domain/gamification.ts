/**
 * Modo gamer: XP, níveis, sequência, conquistas e missões.
 *
 * Objetivo: gastar com consciência — registrar, planejar e guardar. Nunca há XP
 * por gastar, pelo tamanho da renda ou por quantidade de dinheiro.
 *
 * Tudo é CALCULADO a partir dos dados (lançamentos, orçamentos, metas), não
 * guardado como pontos: sincroniza sozinho e não dá para "farmar". A única coisa
 * guardada é o check-in "Hoje não gastei" (no aparelho).
 *
 * Regras aprovadas pelo João em 27/09/2026.
 */
import { addDays, daysInMonth, monthOf, shiftMonth, toDateISO, type DateISO, type MonthKey } from './dates';
import { budgetLines } from './planning';
import { itemsForMonth } from './recurrence';
import { cashItemsForMonth } from './summary';
import type { Category, CreditCard, Goal, Recurrence, Transaction } from './types';

export const XP = {
  day: 10,
  streak7: 50,
  streak30: 200,
  budgetOk: 50,
  allBudgetsOk: 100,
  noOverdue: 50,
  goal25: 25,
  goal50: 50,
  goal75: 75,
  goal100: 200,
  mission: 100,
} as const;

/** compra pequena = até R$ 30 (as "besteiras" que somem com o dinheiro) */
export const SMALL_PURCHASE_CENTS = 3000;

export interface GameInput {
  transactions: Transaction[];
  recurrences: Recurrence[];
  categories: Category[];
  goals: Goal[];
  cards: CreditCard[];
  /** dias marcados como "Hoje não gastei" */
  checkins: DateISO[];
  today: DateISO;
}

// ---------- registro e sequência ----------

const localDate = (iso: string): DateISO => toDateISO(new Date(iso));

/** lançamento que conta como "registrado em dia": feito no mesmo dia ou no dia seguinte, e não importado do extrato */
function countsAsRegistration(t: Transaction): boolean {
  if (t.deletedAt || t.externalId?.startsWith('extrato:') || !t.createdAt) return false;
  const made = localDate(t.createdAt);
  return made === t.date || made === addDays(t.date, 1);
}

/** dias em que você registrou alguma coisa (ou fez check-in) */
export function activeDays(transactions: Transaction[], checkins: DateISO[]): Set<DateISO> {
  const days = new Set<DateISO>();
  for (const t of transactions) if (countsAsRegistration(t)) days.add(localDate(t.createdAt));
  for (const d of checkins) days.add(d);
  return days;
}

/** sequências de dias seguidos, em ordem */
function runs(days: Set<DateISO>): { start: DateISO; length: number }[] {
  const sorted = [...days].sort();
  const out: { start: DateISO; length: number }[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && addDays(last.start, last.length) === d) last.length++;
    else out.push({ start: d, length: 1 });
  }
  return out;
}

/** sequência atual: termina hoje, ou ontem (hoje ainda dá tempo de registrar) */
export function currentStreak(days: Set<DateISO>, today: DateISO): number {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- meses ----------

function monthsBetween(from: MonthKey, toExclusive: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = from; m < toExclusive; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

interface MonthResult {
  month: MonthKey;
  budgetsOk: number;
  budgets: number;
  allBudgetsOk: boolean;
  hadBills: boolean;
  noOverdue: boolean;
}

/**
 * Orçamento não tem histórico: vale a partir do mês em que a categoria foi mexida
 * por último (definir um limite hoje não dá XP retroativo).
 */
function monthResult(month: MonthKey, input: GameInput): MonthResult {
  const lines = budgetLines(month, input.categories, input.transactions, input.recurrences).filter(
    (l) => monthOf(localDate(l.category.updatedAt)) <= month,
  );
  const budgetsOk = lines.filter((l) => l.ratio <= 1).length;
  const bills = cashItemsForMonth(month, input.transactions, input.recurrences, input.cards, input.today).filter((i) => i.type === 'expense');
  return {
    month,
    budgetsOk,
    budgets: lines.length,
    allBudgetsOk: lines.length > 0 && budgetsOk === lines.length,
    hadBills: bills.length > 0,
    noOverdue: bills.length > 0 && bills.every((i) => i.paid),
  };
}

/** compras avulsas pequenas no mês (não conta fixo, parcela nem pagamento de fatura) */
export function smallPurchases(month: MonthKey, transactions: Transaction[], rules: Recurrence[]): number {
  return itemsForMonth(month, transactions, rules).filter(
    (i) => i.type === 'expense' && !i.virtual && !i.recurrenceId && !i.installmentTotal && !i.invoicePayment && !i.invoice && i.amountCents <= SMALL_PURCHASE_CENTS,
  ).length;
}

// ---------- missões ----------

export type MissionKind = 'register' | 'category' | 'small' | 'bills';

export interface Mission {
  kind: MissionKind;
  title: string;
  /** progresso de 0 a 1 */
  progress: number;
  done: boolean;
  /** só se sabe no fim do mês (orçamento, compras pequenas, contas) */
  final: boolean;
  detail: string;
}

/**
 * 3 missões por mês, escolhidas pelos dados do mês anterior:
 * 1. registrar em 20 dias;
 * 2. fechar abaixo de 80% a categoria com orçamento em que mais gastou no mês anterior;
 * 3. fazer 20% menos compras pequenas que no mês anterior (se foram 5 ou mais);
 *    senão, pagar todas as contas do mês em dia.
 */
export function missionsFor(month: MonthKey, input: GameInput, days: Set<DateISO>): Mission[] {
  const closed = month < monthOf(input.today);
  const out: Mission[] = [];

  const target = Math.min(20, daysInMonth(month));
  const registered = [...days].filter((d) => monthOf(d) === month).length;
  out.push({
    kind: 'register', title: `Registre em ${target} dias`, progress: Math.min(1, registered / target),
    done: registered >= target, final: registered >= target || closed, detail: `${registered} de ${target} dias`,
  });

  const prev = shiftMonth(month, -1);
  const prevLines = budgetLines(prev, input.categories, input.transactions, input.recurrences);
  const top = [...prevLines].sort((a, b) => b.plannedCents - a.plannedCents)[0];
  if (top && top.plannedCents > 0) {
    const now = budgetLines(month, input.categories, input.transactions, input.recurrences).find((l) => l.category.id === top.category.id);
    const ratio = now?.ratio ?? 0;
    out.push({
      kind: 'category', title: `Feche ${top.category.name} abaixo de 80%`, progress: Math.min(1, ratio / 0.8),
      done: closed && ratio < 0.8, final: closed || ratio >= 0.8, detail: `${Math.round(ratio * 100)}% do orçamento`,
    });
  }

  const before = smallPurchases(prev, input.transactions, input.recurrences);
  if (before >= 5) {
    const limit = Math.floor(before * 0.8);
    const count = smallPurchases(month, input.transactions, input.recurrences);
    out.push({
      kind: 'small', title: `No máximo ${limit} compras pequenas`, progress: Math.min(1, count / Math.max(1, limit)),
      done: closed && count <= limit, final: closed || count > limit,
      detail: `${count} de ${limit} (até R$ 30 cada; no mês passado foram ${before})`,
    });
  } else {
    const r = monthResult(month, input);
    const bills = cashItemsForMonth(month, input.transactions, input.recurrences, input.cards, input.today).filter((i) => i.type === 'expense');
    const paid = bills.filter((i) => i.paid).length;
    out.push({
      kind: 'bills', title: 'Pague todas as contas do mês em dia', progress: bills.length ? paid / bills.length : 0,
      done: closed && r.noOverdue, final: closed, detail: `${paid} de ${bills.length} pagas`,
    });
  }
  return out;
}

// ---------- níveis ----------

/** XP total para chegar ao nível L: 100 + 200 + … + 100·(L−1) */
export function xpForLevel(level: number): number {
  return (100 * level * (level - 1)) / 2;
}

export function levelFor(xp: number): { level: number; into: number; need: number; title: string } {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return { level, into: xp - xpForLevel(level), need: xpForLevel(level + 1) - xpForLevel(level), title: levelTitle(level) };
}

export function levelTitle(level: number): string {
  if (level >= 12) return 'Lenda';
  if (level >= 8) return 'Mestre das Contas';
  if (level >= 5) return 'Estrategista';
  if (level >= 3) return 'Aprendiz';
  return 'Novato';
}

// ---------- conquistas ----------

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

// ---------- tudo junto ----------

export interface XpLine {
  label: string;
  xp: number;
}

export interface GameState {
  xp: number;
  level: number;
  title: string;
  into: number;
  need: number;
  streak: number;
  bestStreak: number;
  todayActive: boolean;
  missions: Mission[];
  achievements: Achievement[];
  /** de onde veio o XP */
  breakdown: XpLine[];
}

export function gameState(input: GameInput): GameState {
  const days = activeDays(input.transactions, input.checkins);
  const allRuns = runs(days);
  const thisMonth = monthOf(input.today);
  const first = [...days].sort()[0];
  const closedMonths = first ? monthsBetween(monthOf(first), thisMonth) : [];
  const results = closedMonths.map((m) => monthResult(m, input));

  const add = (lines: XpLine[], label: string, xp: number) => { if (xp > 0) lines.push({ label, xp }); };
  const b: XpLine[] = [];

  add(b, `Dias registrados (${days.size})`, days.size * XP.day);
  const s7 = allRuns.filter((r) => r.length >= 7).length;
  const s30 = allRuns.filter((r) => r.length >= 30).length;
  add(b, `Sequências de 7 dias (${s7})`, s7 * XP.streak7);
  add(b, `Sequências de 30 dias (${s30})`, s30 * XP.streak30);

  const okCount = results.reduce((n, r) => n + r.budgetsOk, 0);
  const allOk = results.filter((r) => r.allBudgetsOk).length;
  const noOverdue = results.filter((r) => r.noOverdue).length;
  add(b, `Orçamentos fechados dentro do limite (${okCount})`, okCount * XP.budgetOk);
  add(b, `Meses com todos os orçamentos no limite (${allOk})`, allOk * XP.allBudgetsOk);
  add(b, `Meses sem conta atrasada (${noOverdue})`, noOverdue * XP.noOverdue);

  let goalXp = 0;
  let goals25 = 0;
  let goals100 = 0;
  for (const g of input.goals) {
    if (g.deletedAt || g.targetCents <= 0) continue;
    const pct = g.savedCents / g.targetCents;
    if (pct >= 0.25) { goalXp += XP.goal25; goals25++; }
    if (pct >= 0.5) goalXp += XP.goal50;
    if (pct >= 0.75) goalXp += XP.goal75;
    if (pct >= 1) { goalXp += XP.goal100; goals100++; }
  }
  add(b, 'Marcos de metas', goalXp);

  // missões: meses fechados + as já garantidas neste mês
  let missionsDone = 0;
  for (const m of closedMonths) missionsDone += missionsFor(m, input, days).filter((x) => x.done).length;
  const missions = missionsFor(thisMonth, input, days);
  missionsDone += missions.filter((x) => x.done).length;
  add(b, `Missões cumpridas (${missionsDone})`, missionsDone * XP.mission);

  const xp = b.reduce((n, l) => n + l.xp, 0);
  const lv = levelFor(xp);
  const bestStreak = allRuns.reduce((n, r) => Math.max(n, r.length), 0);
  const budgeted = input.categories.filter((c) => !c.deletedAt && c.type === 'expense' && (c.budgetCents ?? 0) > 0).length;
  const receipts = input.transactions.filter((t) => !t.deletedAt && t.externalId && !t.externalId.startsWith('extrato:')).length;
  let bestAllOkRun = 0;
  let cur = 0;
  for (const r of results) { cur = r.allBudgetsOk ? cur + 1 : 0; bestAllOkRun = Math.max(bestAllOkRun, cur); }

  const achievements: Achievement[] = [
    { id: 'first', title: 'Primeiro passo', description: 'Registrar o primeiro lançamento.', icon: 'shoe-print', unlocked: days.size > 0 },
    { id: 'streak7', title: 'Uma semana firme', description: 'Sequência de 7 dias.', icon: 'fire', unlocked: bestStreak >= 7 },
    { id: 'streak30', title: 'Mês de ferro', description: 'Sequência de 30 dias.', icon: 'shield-star-outline', unlocked: bestStreak >= 30 },
    { id: 'planner', title: 'Planejador', description: 'Orçamento definido em 3 categorias.', icon: 'map-outline', unlocked: budgeted >= 3 },
    { id: 'inlimit', title: 'Dentro do limite', description: 'Um mês com todos os orçamentos em até 100%.', icon: 'heart-outline', unlocked: allOk >= 1 },
    { id: 'three', title: 'Três seguidos', description: '3 meses seguidos com todos os orçamentos no limite.', icon: 'podium-gold', unlocked: bestAllOkRun >= 3 },
    { id: 'piggy', title: 'Cofrinho', description: 'Uma meta chegar a 25%.', icon: 'piggy-bank-outline', unlocked: goals25 >= 1 },
    { id: 'quest', title: 'Missão cumprida', description: 'Uma meta chegar a 100%.', icon: 'trophy', unlocked: goals100 >= 1 },
    { id: 'ontime', title: 'Zero atrasos', description: 'Um mês sem nenhuma conta atrasada.', icon: 'clock-check-outline', unlocked: noOverdue >= 1 },
    { id: 'reader', title: 'Leitor de comprovante', description: '10 Pix lançados pelo comprovante.', icon: 'receipt-text-check-outline', unlocked: receipts >= 10 },
  ];

  return {
    xp, level: lv.level, title: lv.title, into: lv.into, need: lv.need,
    streak: currentStreak(days, input.today), bestStreak, todayActive: days.has(input.today),
    missions, achievements, breakdown: b,
  };
}

