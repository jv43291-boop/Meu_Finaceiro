import { describe, expect, it } from 'vitest';

import { stableId, occurrenceId } from '../../domain/ids';
import { remoteWins, rewindCursor, syncOnce, SYNC_TABLES, type LocalStore, type RemoteRow, type RemoteStore, type SyncTable } from '../engine';

/** Servidor em memória que imita o trigger do Supabase (vence updated_at maior; carimba server_updated_at). */
class FakeRemote implements RemoteStore {
  rows = new Map<SyncTable, Map<string, RemoteRow>>(SYNC_TABLES.map((t) => [t, new Map()]));
  private clock = Date.parse('2026-09-25T12:00:00Z');
  async upsert(table: SyncTable, rows: RemoteRow[]) {
    for (const r of rows) {
      const old = this.rows.get(table)!.get(r.id);
      if (old && Date.parse(r.updated_at) < Date.parse(old.updated_at)) continue;
      this.clock += 1;
      this.rows.get(table)!.set(r.id, { ...r, server_updated_at: new Date(this.clock).toISOString() });
    }
  }
  async pullSince(table: SyncTable, since: string | null, limit: number) {
    return [...this.rows.get(table)!.values()]
      .filter((r) => !since || r.server_updated_at! > since)
      .sort((a, b) => (a.server_updated_at! < b.server_updated_at! ? -1 : 1))
      .slice(0, limit);
  }
}

/** Aparelho em memória. */
class FakeDevice implements LocalStore {
  rows = new Map<SyncTable, Map<string, RemoteRow & { dirty: boolean }>>(SYNC_TABLES.map((t) => [t, new Map()]));
  cursors = new Map<SyncTable, string>();
  write(table: SyncTable, row: RemoteRow) {
    this.rows.get(table)!.set(row.id, { ...row, dirty: true });
  }
  get(table: SyncTable, id: string) {
    return this.rows.get(table)!.get(id);
  }
  async dirty(table: SyncTable, limit: number) {
    return [...this.rows.get(table)!.values()].filter((r) => r.dirty).slice(0, limit).map(({ dirty: _d, ...r }) => r as RemoteRow);
  }
  async markClean(table: SyncTable, rows: { id: string; updated_at: string }[]) {
    for (const r of rows) {
      const cur = this.rows.get(table)!.get(r.id);
      if (cur && cur.updated_at === r.updated_at) cur.dirty = false;
    }
  }
  async applyRemote(table: SyncTable, rows: RemoteRow[]) {
    let n = 0;
    for (const r of rows) {
      const cur = this.rows.get(table)!.get(r.id);
      if (!remoteWins(cur, r)) continue;
      this.rows.get(table)!.set(r.id, { ...r, dirty: false });
      n++;
    }
    return n;
  }
  async getCursor(t: SyncTable) { return this.cursors.get(t) ?? null; }
  async setCursor(t: SyncTable, c: string) { this.cursors.set(t, c); }
}

const tx = (id: string, updated_at: string, extra: Record<string, unknown> = {}): RemoteRow => ({ id, updated_at, description: 'x', amount_cents: 100, ...extra });

describe('sincronização', () => {
  it('leva um lançamento de um aparelho para o outro', async () => {
    const server = new FakeRemote(); const a = new FakeDevice(); const b = new FakeDevice();
    a.write('transactions', tx('t1', '2026-09-25T10:00:00.000Z', { description: 'Mercado' }));
    const ra = await syncOnce(a, server);
    expect(ra.pushed).toBe(1);
    expect(a.get('transactions', 't1')!.dirty).toBe(false);
    const rb = await syncOnce(b, server);
    expect(rb.changedLocally).toBe(1);
    expect(b.get('transactions', 't1')!.description).toBe('Mercado');
  });

  it('vence a alteração mais recente, dos dois lados', async () => {
    const server = new FakeRemote(); const a = new FakeDevice(); const b = new FakeDevice();
    a.write('transactions', tx('t1', '2026-09-25T10:00:00.000Z'));
    await syncOnce(a, server); await syncOnce(b, server);
    // offline: A edita às 11h, B edita às 12h
    a.write('transactions', tx('t1', '2026-09-25T11:00:00.000Z', { amount_cents: 111 }));
    b.write('transactions', tx('t1', '2026-09-25T12:00:00.000Z', { amount_cents: 222 }));
    await syncOnce(b, server);
    await syncOnce(a, server); // A tenta subir a versão velha: o servidor ignora, e A recebe a de B
    await syncOnce(b, server);
    expect(server.rows.get('transactions')!.get('t1')!.amount_cents).toBe(222);
    expect(a.get('transactions', 't1')!.amount_cents).toBe(222);
    expect(b.get('transactions', 't1')!.amount_cents).toBe(222);
  });

  it('exclusão lógica chega no outro aparelho', async () => {
    const server = new FakeRemote(); const a = new FakeDevice(); const b = new FakeDevice();
    a.write('transactions', tx('t1', '2026-09-25T10:00:00.000Z'));
    await syncOnce(a, server); await syncOnce(b, server);
    b.write('transactions', tx('t1', '2026-09-25T10:05:00.000Z', { deleted_at: '2026-09-25T10:05:00.000Z' }));
    await syncOnce(b, server); await syncOnce(a, server);
    expect(a.get('transactions', 't1')!.deleted_at).toBe('2026-09-25T10:05:00.000Z');
  });

  it('pagina quando há mais de um lote', async () => {
    const server = new FakeRemote(); const a = new FakeDevice(); const b = new FakeDevice();
    for (let i = 0; i < 1203; i++) a.write('transactions', tx(`t${i}`, '2026-09-25T10:00:00.000Z'));
    const ra = await syncOnce(a, server);
    expect(ra.pushed).toBe(1203);
    const rb = await syncOnce(b, server);
    expect(b.rows.get('transactions')!.size).toBe(1203);
    expect(rb.changedLocally).toBe(1203);
    // segunda rodada não reaplica nada
    expect((await syncOnce(b, server)).changedLocally).toBe(0);
  });

  it('cursor recua alguns segundos por segurança', () => {
    expect(rewindCursor('2026-09-25T12:00:10.000Z')).toBe('2026-09-25T12:00:05.000Z');
    expect(rewindCursor(null)).toBeNull();
  });
});

describe('ids fixos', () => {
  it('são estáveis e têm formato UUID', () => {
    const id = occurrenceId('abc', '2026-09');
    expect(id).toBe(occurrenceId('abc', '2026-09'));
    expect(id).not.toBe(occurrenceId('abc', '2026-10'));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableId('seed:account:default')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
