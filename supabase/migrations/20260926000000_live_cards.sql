-- Live Finanças — cartão de crédito e faturas (fase 3)
-- Rodar DEPOIS de 20260925000000_live_sync.sql, uma vez, no SQL Editor.
-- Pode rodar de novo sem problema (idempotente).

create table if not exists public.credit_cards (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  limit_cents bigint not null default 0,
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  account_id uuid,
  color text not null default '#5B45FF',
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists credit_cards_user_sync_idx on public.credit_cards (user_id, server_updated_at);

alter table public.transactions add column if not exists card_id uuid;
alter table public.transactions add column if not exists invoice_month text check (invoice_month ~ '^\d{4}-\d{2}$');
alter table public.transactions add column if not exists invoice_payment boolean not null default false;
alter table public.recurrences add column if not exists card_id uuid;

-- mesmas regras das outras tabelas: dono lê/cria/altera, sem DELETE, "vence o mais recente"
drop trigger if exists live_sync_stamp on public.credit_cards;
create trigger live_sync_stamp before insert or update on public.credit_cards
  for each row execute function public.live_sync_stamp();

alter table public.credit_cards enable row level security;
drop policy if exists "dono le" on public.credit_cards;
drop policy if exists "dono cria" on public.credit_cards;
drop policy if exists "dono altera" on public.credit_cards;
create policy "dono le" on public.credit_cards for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono cria" on public.credit_cards for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono altera" on public.credit_cards for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.credit_cards from anon, authenticated;
grant select, insert, update on public.credit_cards to authenticated;

-- avisa o PostgREST das colunas novas (senão o app recebe "column not found" até o cache renovar)
notify pgrst, 'reload schema';
