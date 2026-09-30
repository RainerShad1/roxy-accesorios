-- Ejecutar completo en Supabase > SQL Editor
create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty int not null check (qty >= 0),
  cost numeric not null check (cost >= 0),
  gain numeric not null check (gain >= 0),
  sold int not null default 0,
  image_url text,
  created_at timestamptz not null default now()
);
create table movements (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  inv numeric not null default 0,
  sold numeric not null default 0,
  gain numeric not null default 0,
  item_name text,
  qty int,
  kind text,
  created_at timestamptz not null default now()
);
alter table items enable row level security;
alter table movements enable row level security;
create policy "acceso items" on items for all to anon, authenticated using (true) with check (true);
create policy "acceso movimientos" on movements for all to anon, authenticated using (true) with check (true);

create or replace function sell_item(p_id uuid, p_n int, p_day date) returns void
language plpgsql as $$
declare it items%rowtype;
begin
  update items set qty = qty - p_n, sold = sold + p_n
    where id = p_id and qty >= p_n returning * into it;
  if not found then raise exception 'Stock insuficiente'; end if;
  insert into movements(day, inv, sold, gain, item_name, qty, kind) values (p_day, 0, (it.cost + it.gain) * p_n, it.gain * p_n, it.name, p_n, 'venta');
end $$;

insert into storage.buckets(id, name, public) values ('items', 'items', true) on conflict do nothing;
create policy "ver imagenes" on storage.objects for select using (bucket_id = 'items');
create policy "subir imagenes" on storage.objects for insert to anon, authenticated with check (bucket_id = 'items');

alter publication supabase_realtime add table items, movements;
