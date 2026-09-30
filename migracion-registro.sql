-- Solo si ya ejecutaste supabase.sql antes. Pegar y ejecutar en SQL Editor.
alter table movements add column if not exists item_name text, add column if not exists qty int, add column if not exists kind text;

create or replace function sell_item(p_id uuid, p_n int, p_day date) returns void
language plpgsql as $$
declare it items%rowtype;
begin
  update items set qty = qty - p_n, sold = sold + p_n
    where id = p_id and qty >= p_n returning * into it;
  if not found then raise exception 'Stock insuficiente'; end if;
  insert into movements(day, inv, sold, gain, item_name, qty, kind) values (p_day, 0, (it.cost + it.gain) * p_n, it.gain * p_n, it.name, p_n, 'venta');
end $$;
