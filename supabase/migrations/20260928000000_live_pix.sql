-- Live Finanças — leitura de comprovante de Pix
-- Rodar depois das migrações anteriores, uma vez, no SQL Editor. Idempotente.
--
-- Regras de negócio que moram aqui:
-- * transactions.external_id guarda o ID do Pix (E2E) do comprovante. O app usa
--   para avisar "este comprovante já foi lançado". Não é UNIQUE de propósito:
--   o mesmo Pix pode ter sido lançado em dois celulares antes de sincronizar, e
--   uma trava no banco faria o sync falhar em vez de deixar você decidir.
-- * payee_rules: "Pix para FULANO = descrição X, categoria Y, conta Z".
--   match_name é o nome normalizado (sem acento, minúsculo); match_doc são os
--   dígitos visíveis do CPF/CNPJ (null = vale só pelo nome). Quando duas regras
--   combinam, o app usa a que tem documento, e depois a alterada mais recentemente.

alter table public.transactions add column if not exists external_id text;
create index if not exists transactions_external_idx on public.transactions (user_id, external_id)
  where external_id is not null;

create table if not exists public.payee_rules (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  match_name text not null check (length(match_name) between 1 and 200),
  match_doc text check (match_doc is null or match_doc ~ '^[0-9]{2,14}$'),
  description text not null check (length(description) between 1 and 200),
  category_id uuid,
  account_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists payee_rules_user_sync_idx on public.payee_rules (user_id, server_updated_at);

drop trigger if exists live_sync_stamp on public.payee_rules;
create trigger live_sync_stamp before insert or update on public.payee_rules
  for each row execute function public.live_sync_stamp();

alter table public.payee_rules enable row level security;
drop policy if exists "dono le" on public.payee_rules;
drop policy if exists "dono cria" on public.payee_rules;
drop policy if exists "dono altera" on public.payee_rules;
create policy "dono le" on public.payee_rules for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono cria" on public.payee_rules for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono altera" on public.payee_rules for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.payee_rules from anon, authenticated;
grant select, insert, update on public.payee_rules to authenticated;

notify pgrst, 'reload schema';
