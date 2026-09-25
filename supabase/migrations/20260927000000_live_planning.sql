-- Live Finanças — orçamento por categoria e metas (fase 4)
-- Rodar depois das migrações anteriores, uma vez, no SQL Editor. Idempotente.

alter table public.categories add column if not exists budget_cents bigint check (budget_cents is null or budget_cents >= 0);

create table if not exists public.goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  target_cents bigint not null check (target_cents >= 0),
  saved_cents bigint not null default 0,
  target_date date,
  icon text not null default 'piggy-bank-outline',
  color text not null default '#5B45FF',
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index if not exists goals_user_sync_idx on public.goals (user_id, server_updated_at);

drop trigger if exists live_sync_stamp on public.goals;
create trigger live_sync_stamp before insert or update on public.goals
  for each row execute function public.live_sync_stamp();

alter table public.goals enable row level security;
drop policy if exists "dono le" on public.goals;
drop policy if exists "dono cria" on public.goals;
drop policy if exists "dono altera" on public.goals;
create policy "dono le" on public.goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono cria" on public.goals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono altera" on public.goals for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.goals from anon, authenticated;
grant select, insert, update on public.goals to authenticated;

notify pgrst, 'reload schema';
