// Verifica se o Supabase está pronto para o Live Finanças.
// Uso (na pasta do projeto): node scripts/verificar-supabase.mjs
// Lê a URL e a chave do .env; a chave não é mostrada nem enviada para outro lugar.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const ok = (m) => console.log('  OK   ' + m);
const bad = (m) => { console.log('  ERRO ' + m); process.exitCode = 1; };

console.log('\nLive Finanças — verificação do Supabase\n');
if (!url?.startsWith('https://')) bad('EXPO_PUBLIC_SUPABASE_URL ausente no .env');
if (!key || key.includes('COLE_')) bad('chave ainda é o texto de exemplo');
else if (key.startsWith('sb_secret_')) bad('essa é a chave SECRETA — troque pela publishable');
else ok(`chave ${key.startsWith('sb_publishable_') ? 'publishable' : 'anon'} encontrada`);

const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
async function get(path) {
  try {
    const r = await fetch(url + path, { headers });
    return { status: r.status, body: await r.text() };
  } catch (e) {
    return { status: 0, body: String(e) };
  }
}

const health = await get('/auth/v1/health');
if (health.status === 200) ok('projeto responde (auth)');
else bad(`projeto não respondeu (status ${health.status}) ${health.body.slice(0, 120)}`);

const CHECKS = {
  accounts: 'id,server_updated_at',
  categories: 'id,budget_cents,server_updated_at',
  goals: 'id,target_cents,saved_cents,server_updated_at',
  credit_cards: 'id,closing_day,server_updated_at',
  recurrences: 'id,card_id,server_updated_at',
  transactions: 'id,card_id,invoice_month,invoice_payment,external_id,server_updated_at',
  payee_rules: 'id,match_name,match_doc,server_updated_at',
};
for (const [t, cols] of Object.entries(CHECKS)) {
  const r = await get(`/rest/v1/${t}?select=${cols}&limit=1`);
  if (r.status === 200) ok(`tabela ${t} existe (sem login, o RLS devolve lista vazia: ${r.body})`);
  else if (/column|PGRST204|42703/.test(r.body)) bad(`tabela ${t} sem as colunas novas — rode as migrações de supabase/migrations que faltam, em ordem`);
  else if (r.status === 404 || /PGRST205|does not exist|Could not find/.test(r.body)) bad(`tabela ${t} não existe — rode as migrações de supabase/migrations em ordem`);
  else if (r.status === 401 || r.status === 403) ok(`tabela ${t} existe e está fechada para quem não entrou (status ${r.status})`);
  else bad(`tabela ${t}: status ${r.status} ${r.body.slice(0, 160)}`);
}
const legacy = await get('/rest/v1/finance_backups?select=user_id&limit=1');
console.log(`  info tabela antiga finance_backups: status ${legacy.status}`);
console.log(process.exitCode ? '\nHá itens para corrigir acima.\n' : '\nTudo certo do lado do Supabase.\n');
