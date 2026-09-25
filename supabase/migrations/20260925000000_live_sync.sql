-- Live Finanças — tabelas de sincronização (fase 2)
-- Aplicar uma vez no SQL Editor do Supabase (projeto xnsajwmjezhabawctxla)
-- ou com `supabase db push`. Não mexe na tabela antiga public.finance_backups.
--
-- Modelo: cada registro é do usuário (user_id = auth.uid()), com RLS.
-- O app manda updated_at (hora da alteração no aparelho); o servidor guarda
-- server_updated_at (hora em que recebeu), usado como cursor do "pull".
-- Regra de conflito: vence a alteração mais recente (updated_at maior).
-- Exclusão é lógica (deleted_at) para a exclusão chegar nos outros aparelhos.

create table if not exists public.accounts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'cash',
  opening_balance_cents bigint not null default 0,
  color text not null default '#5B45FF',
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.categories (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text not null default 'tag-outline',
  color text not null default '#8A9491',
  archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.recurrences (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  description text not null,
  amount_cents bigint not null,
  category_id uuid,
  account_id uuid,
  day smallint not null check (day between 1 and 31),
  start_month text not null check (start_month ~ '^\d{4}-\d{2}$'),
  end_month text check (end_month ~ '^\d{4}-\d{2}$'),
  notes text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.transactions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  description text not null,
  amount_cents bigint not null,
  date date not null,
  paid boolean not null default false,
  category_id uuid,
  account_id uuid,
  notes text not null default '',
  recurrence_id uuid,
  occurrence_month text check (occurrence_month ~ '^\d{4}-\d{2}$'),
  group_id uuid,
  installment_number smallint,
  installment_total smallint,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

-- cursor do pull e isolamento por usuário
create index if not exists accounts_user_sync_idx on public.accounts (user_id, server_updated_at);
create index if not exists categories_user_sync_idx on public.categories (user_id, server_updated_at);
create index if not exists recurrences_user_sync_idx on public.recurrences (user_id, server_updated_at);
create index if not exists transactions_user_sync_idx on public.transactions (user_id, server_updated_at);

-- Carimba server_updated_at e aplica "vence o mais recente":
-- uma atualização com updated_at mais antigo que o gravado é ignorada.
create or replace function public.live_sync_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return old;
    end if;
    new.user_id := old.user_id; -- dono não muda
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['accounts', 'categories', 'recurrences', 'transactions'] loop
    execute format('drop trigger if exists live_sync_stamp on public.%I', t);
    execute format(
      'create trigger live_sync_stamp before insert or update on public.%I for each row execute function public.live_sync_stamp()',
      t
    );
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono le" on public.%I', t);
    execute format('drop policy if exists "dono cria" on public.%I', t);
    execute format('drop policy if exists "dono altera" on public.%I', t);
    execute format(
      'create policy "dono le" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "dono cria" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "dono altera" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    -- sem policy de DELETE: o app só faz exclusão lógica
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;
