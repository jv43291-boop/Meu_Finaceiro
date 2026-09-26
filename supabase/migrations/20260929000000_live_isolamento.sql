-- Live Finanças — isolamento entre contas
-- Rodar uma vez no SQL Editor, depois das migrações anteriores. Idempotente.
--
-- Problema: a chave das tabelas era só "id". A conta padrão e as categorias
-- padrão usam o MESMO id em todo celular, então a primeira pessoa a sincronizar
-- ficava dona desses ids e a sincronização de qualquer outra pessoa falhava
-- ("violates row-level security"). Nenhum dado vazava (o RLS barrava), mas o
-- sync da segunda conta nunca funcionava.
--
-- Correção: a chave passa a ser (user_id, id). O mesmo id pode existir uma vez
-- por dono. As regras de acesso (RLS) não mudam.
-- O app atualizado envia com on_conflict = user_id,id; enquanto esta migração
-- não roda, ele volta sozinho para on_conflict = id.

do $$
declare
  t text;
  pk text;
  cols int;
begin
  foreach t in array array['accounts', 'categories', 'credit_cards', 'goals', 'payee_rules', 'recurrences', 'transactions'] loop
    select c.conname, array_length(c.conkey, 1) into pk, cols
      from pg_constraint c
     where c.conrelid = format('public.%I', t)::regclass and c.contype = 'p';
    if cols = 2 then
      continue; -- já está em (user_id, id)
    end if;
    if pk is not null then
      execute format('alter table public.%I drop constraint %I', t, pk);
    end if;
    execute format('alter table public.%I add constraint %I primary key (user_id, id)', t, t || '_pkey');
  end loop;
end $$;

notify pgrst, 'reload schema';
