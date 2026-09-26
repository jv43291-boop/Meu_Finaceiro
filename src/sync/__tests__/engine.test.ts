import { describe, expect, it } from 'vitest';

import { stableId, occurrenceId } from '../../domain/ids';
import { remoteWins, rewindCursor, SyncError, syncOnce, SYNC_TABLES, type LocalStore, type RemoteRow, type RemoteStore, type SyncTable } from '../engine';
import { classify } from '../remote';

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

/** Aparelho com quarentena, como o app. */
class QDevice extends FakeDevice {
  quarantined = new Map<string, string>();
  async dirty(table: SyncTable, limit: number) {
    return (await super.dirty(table, 10_000)).filter((r) => !this.quarantined.has(`${table}:${r.id}`)).slice(0, limit);
  }
  async quarantine(table: SyncTable, rows: { id: string }[], error: string) {
    for (const r of rows) this.quarantined.set(`${table}:${r.id}`, error);
  }
  async release(table: SyncTable, ids: string[]) {
    for (const id of ids) this.quarantined.delete(`${table}:${id}`);
  }
}

/** Servidor que recusa registros com id começando por "ruim" (como um check constraint). */
class PickyRemote extends FakeRemote {
  calls = 0;
  offline = false;
  async upsert(table: SyncTable, rows: RemoteRow[]) {
    this.calls++;
    if (this.offline) throw new SyncError('Falha ao enviar: TypeError: fetch failed', 'network');
    if (rows.some((r) => r.id.startsWith('ruim'))) throw new SyncError('Falha ao enviar: violates check constraint', 'rejected');
    return super.upsert(table, rows);
  }
}

describe('fila: registro recusado não trava o resto', () => {
  it('isola o recusado, sobe o resto e ainda baixa o que veio de outro celular', async () => {
    const server = new PickyRemote(); const a = new QDevice();
    server.rows.get('transactions')!.set('de-outro', { ...tx('de-outro', '2026-09-25T09:00:00.000Z'), server_updated_at: '2026-09-25T09:00:00.000Z' });
    a.write('payee_rules', { id: 'ruim-1', updated_at: '2026-09-25T10:00:00.000Z' });
    for (let i = 0; i < 9; i++) a.write('payee_rules', { id: `bom-${i}`, updated_at: '2026-09-25T10:00:00.000Z' });
    a.write('transactions', tx('t1', '2026-09-25T10:00:00.000Z'));
    const r = await syncOnce(a, server);
    expect(r.rejected).toBe(1);
    expect(r.pushed).toBe(10);
    expect(server.rows.get('payee_rules')!.size).toBe(9);
    expect(server.rows.get('transactions')!.has('t1')).toBe(true);
    expect(a.get('transactions', 'de-outro')).toBeTruthy();
    expect(a.quarantined.get('payee_rules:ruim-1')).toMatch(/check constraint/);
    // o recusado continua pendente no aparelho (não se perde)
    expect(a.get('payee_rules', 'ruim-1')!.dirty).toBe(true);
    // a próxima rodada não fica batendo no mesmo registro
    const calls = server.calls;
    await syncOnce(a, server);
    expect(server.calls).toBe(calls);
  });

  it('quando o registro é corrigido e sobe, sai da quarentena', async () => {
    const server = new PickyRemote(); const a = new QDevice();
    a.write('payee_rules', { id: 'ruim-x', updated_at: '2026-09-25T10:00:00.000Z' });
    await syncOnce(a, server);
    expect(a.quarantined.size).toBe(1);
    a.quarantined.clear(); // "Tentar de novo"
    server.upsert = FakeRemote.prototype.upsert.bind(server); // servidor passou a aceitar
    await syncOnce(a, server);
    expect(a.get('payee_rules', 'ruim-x')!.dirty).toBe(false);
  });

  it('sem internet: não marca nada como enviado e não põe ninguém na quarentena', async () => {
    const server = new PickyRemote(); server.offline = true; const a = new QDevice();
    a.write('transactions', tx('t1', '2026-09-25T10:00:00.000Z'));
    await expect(syncOnce(a, server)).rejects.toMatchObject({ kind: 'network' });
    expect(a.get('transactions', 't1')!.dirty).toBe(true);
    expect(a.quarantined.size).toBe(0);
  });
});

describe('classifica os erros do Supabase', () => {
  it('separa internet, sessão e dado recusado', () => {
    expect(classify({ message: 'TypeError: Network request failed' })).toBe('network');
    expect(classify({ message: 'JWT expired', code: 'PGRST303' })).toBe('auth');
    expect(classify({ message: 'new row for relation "payee_rules" violates check constraint', code: '23514' })).toBe('rejected');
    expect(classify({ message: 'value too long for type', code: '22001' })).toBe('rejected');
    expect(classify({ message: 'algo estranho', code: 'XX000' })).toBe('unknown');
  });
});
