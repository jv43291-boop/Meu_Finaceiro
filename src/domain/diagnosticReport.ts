/**
 * Texto do diagnóstico para copiar/enviar. Só números técnicos e estados:
 * nenhum valor, descrição, nome de conta/categoria ou recebedor; e-mail mascarado.
 */
import type { IntegrityIssue } from './integrity';

export interface DiagnosticInput {
  generatedAt: string;
  app: { version: string; runtime: string | null; channel: string | null; updateId: string | null; embedded: boolean; platform: string };
  sqlite: { ok: boolean; check: string; schemaVersion: number; tables: { table: string; total: number; deleted: number; pending: number }[]; quarantined: number };
  auth: { configured: boolean; signedIn: boolean; email: string | null };
  supabase: { ok: boolean; ms: number | null; status: number | null } | null;
  sync: { status: string; lastSyncAt: string | null; pending: number; rejected: number; nextRetryAt: string | null; clockSkewMs: number | null };
  issues: IntegrityIssue[];
}

export function maskEmail(email: string | null): string {
  if (!email) return '—';
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}

export function buildDiagnosticReport(d: DiagnosticInput): string {
  const l: string[] = [];
  l.push(`Diagnóstico do Live Finanças — ${d.generatedAt}`);
  l.push(`App ${d.app.version} · ${d.app.platform} · runtime ${d.app.runtime ?? '—'} · canal ${d.app.channel ?? '—'} · ${d.app.embedded ? 'versão do APK' : `atualização ${d.app.updateId?.slice(0, 8) ?? '—'}`}`);
  l.push('');
  l.push(`SQLite: ${d.sqlite.ok ? 'OK' : `ERRO (${d.sqlite.check})`} · schema v${d.sqlite.schemaVersion}`);
  for (const t of d.sqlite.tables) l.push(`  ${t.table}: ${t.total} registros (${t.deleted} excluídos, ${t.pending} pendentes)`);
  l.push(`  quarentena: ${d.sqlite.quarantined}`);
  l.push('');
  l.push(`Conta: ${!d.auth.configured ? 'nuvem não configurada' : d.auth.signedIn ? `conectado (${maskEmail(d.auth.email)})` : 'não conectado'}`);
  l.push(`Supabase: ${d.supabase === null ? 'não testado' : d.supabase.ok ? `OK (${d.supabase.ms} ms)` : `sem resposta${d.supabase.status ? ` (status ${d.supabase.status})` : ''}`}`);
  l.push(`Sync: ${d.sync.status} · última ${d.sync.lastSyncAt ?? 'nunca'} · pendentes ${d.sync.pending} · recusados ${d.sync.rejected}${d.sync.nextRetryAt ? ` · próxima tentativa ${d.sync.nextRetryAt}` : ''}`);
  if (d.sync.clockSkewMs !== null) l.push(`Relógio do celular: ${Math.round(d.sync.clockSkewMs / 1000)} s de diferença para o servidor`);
  l.push('');
  l.push(d.issues.length ? 'Integridade:' : 'Integridade: nenhum problema encontrado');
  for (const i of d.issues) l.push(`  [${i.code}] ${i.label}: ${i.count}`);
  return l.join('\n');
}
