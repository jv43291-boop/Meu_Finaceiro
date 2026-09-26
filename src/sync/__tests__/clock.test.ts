import { describe, expect, it } from 'vitest';

import { createClock, offsetFromDateHeader } from '../clock';
import { remoteWins, syncOnce, SYNC_TABLES, type LocalStore, type RemoteRow, type RemoteStore, type SyncTable } from '../engine';

describe('relógio das alterações', () => {
  it('nunca volta para trás, mesmo se o relógio do celular voltar', () => {
    let wall = Date.parse('2026-09-26T12:00:00Z');
    const c = createClock(() => wall);
    const a = c.now();
    wall -= 60 * 60_000; // relógio "voltou" 1 h
    const b = c.now();
    expect(b > a).toBe(true);
  });

  it('marca depois de qualquer versão já vista', () => {
    const c = createClock(() => Date.parse('2026-09-26T11:00:00Z'));
    c.observe('2026-09-26T12:00:00.000Z');
    expect(c.now()).toBe('2026-09-26T12:00:00.001Z');
  });

  it('usa a hora corrigida quando a diferença é relevante', () => {
    const c = createClock(() => Date.parse('2026-09-26T11:00:00Z'));
    c.setOffset(10_000); // 10 s: ruído, ignora
    expect(c.now()).toBe('2026-09-26T11:00:00.000Z');
    c.setOffset(60 * 60_000); // celular 1 h atrasado
    expect(c.now()).toBe('2026-09-26T12:00:00.000Z');
  });

  it('mede a diferença pelo cabeçalho Date', () => {
    const sent = Date.parse('2026-09-26T11:00:00.000Z');
    const off = offsetFromDateHeader('Sat, 26 Sep 2026 12:00:00 GMT', sent, sent + 200);
    expect(off).toBe(60 * 60_000 + 400);
    expect(offsetFromDateHeader(null, 0, 0)).toBeNull();
    expect(offsetFromDateHeader('lixo', 0, 0)).toBeNull();
  });
});

// --- os dois casos reproduzidos, agora com o relógio de verdade de cada celular ---

class FakeRemote implements RemoteStore {
  rows = new Map<SyncTable, Map<string, RemoteRow>>(SYNC_TABLES.map((t) => [t, new Map()]));
  private serial = 0;
  async upsert(table: SyncTable, rows: RemoteRow[]) {
    for (const r of rows) {
      const old = this.rows.get(table)!.get(r.id);
      if (old && Date.parse(r.updated_at) < Date.parse(old.updated_at)) continue; // igual ao trigger do Supabase
      this.rows.get(table)!.set(r.id, { ...r, server_updated_at: new Date(Date.UTC(2026, 0, 1) + ++this.serial).toISOString() });
    }
  }
  async pullSince(table: SyncTable, since: string | null, limit: number) {
    return [...this.rows.get(table)!.values()].filter((r) => !since || r.server_updated_at! > since).slice(0, limit);
  }
}

/** Celular em memória que, como o app, registra no relógio tudo o que baixa. */
class Device implements LocalStore {
  rows = new Map<SyncTable, Map<string, RemoteRow & { dirty: boolean }>>(SYNC_TABLES.map((t) => [t, new Map()]));
  cursors = new Map<SyncTable, string>();
  constructor(public clock: ReturnType<typeof createClock>) {}
  edit(id: string, amount: number) {
    const updated_at = this.clock.now();
    this.clock.observe(updated_at);
    this.rows.get('transactions')!.set(id, { id, updated_at, amount_cents: amount, dirty: true });
  }
  amount(id: string) { return this.rows.get('transactions')!.get(id)!.amount_cents; }
  async dirty(t: SyncTable) { return [...this.rows.get(t)!.values()].filter((r) => r.dirty).map(({ dirty: _d, ...r }) => r as RemoteRow); }
  async markClean(t: SyncTable, rows: { id: string; updated_at: string }[]) {
    for (const r of rows) { const cur = this.rows.get(t)!.get(r.id); if (cur && cur.updated_at === r.updated_at) cur.dirty = false; }
  }
  async applyRemote(t: SyncTable, rows: RemoteRow[]) {
    let n = 0;
    for (const r of rows) {
      this.clock.observe(r.updated_at);
      if (!remoteWins(this.rows.get(t)!.get(r.id), r)) continue;
      this.rows.get(t)!.set(r.id, { ...r, dirty: false }); n++;
    }
    return n;
  }
  async getCursor(t: SyncTable) { return this.cursors.get(t) ?? null; }
  async setCursor(t: SyncTable, c: string) { this.cursors.set(t, c); }
}

describe('sync com relógio errado', () => {
  it('relógio 1 h atrasado: a correção feita depois vence', async () => {
    let real = Date.parse('2026-09-26T12:00:00Z');
    const server = new FakeRemote();
    const b = new Device(createClock(() => real)); // relógio certo
    const a = new Device(createClock(() => real - 60 * 60_000)); // 1 h atrasado
    b.edit('t1', 100);
    await syncOnce(b, server); await syncOnce(a, server);
    real += 10 * 60_000;
    a.edit('t1', 999); // corrige depois de ver o 100
    await syncOnce(a, server); await syncOnce(b, server);
    expect([a.amount('t1'), b.amount('t1'), server.rows.get('transactions')!.get('t1')!.amount_cents]).toEqual([999, 999, 999]);
  });

  it('relógio 2 h adiantado: quem edita depois dele vence', async () => {
    let real = Date.parse('2026-09-26T12:00:00Z');
    const server = new FakeRemote();
    const a = new Device(createClock(() => real + 2 * 60 * 60_000)); // 2 h adiantado
    const b = new Device(createClock(() => real));
    a.edit('t1', 100);
    await syncOnce(a, server); await syncOnce(b, server);
    real += 60 * 60_000;
    b.edit('t1', 555);
    await syncOnce(b, server); await syncOnce(a, server);
    expect([a.amount('t1'), b.amount('t1'), server.rows.get('transactions')!.get('t1')!.amount_cents]).toEqual([555, 555, 555]);
  });
});
