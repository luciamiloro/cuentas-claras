-- ============================================================
-- Cuentas Claras — esquema para Supabase (Postgres)
-- Pegalo entero en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- Gastos: una fila por gasto, siempre ligada al usuario logueado
create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date           date not null,
  amount         numeric(14, 2) not null check (amount > 0),
  category_id    text not null,
  description    text not null default '',
  payment_method text not null check (payment_method in ('efectivo', 'debito', 'credito', 'transferencia')),
  created_at     timestamptz not null default now()
);

-- Gastos en dólares y tarjeta (columnas agregadas con "if not exists" para poder re-ejecutar el script)
alter table public.expenses add column if not exists currency text not null default 'ARS' check (currency in ('ARS', 'USD'));
alter table public.expenses add column if not exists original_amount numeric(14, 2);
alter table public.expenses add column if not exists card_id text;
-- Cuotas: "amount" es siempre el total; los resúmenes de la tarjeta lo reparten en cuotas
alter table public.expenses add column if not exists installments smallint not null default 1 check (installments between 1 and 48);

create index if not exists expenses_user_date_idx on public.expenses (user_id, date);

-- Preferencias por usuario (por ahora, el presupuesto mensual)
create table if not exists public.user_settings (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  monthly_budget numeric(14, 2) check (monthly_budget is null or monthly_budget > 0),
  updated_at     timestamptz not null default now()
);

-- Cotizaciones manuales, tarjetas y cuentas de ahorro (JSON: cambian poco y se leen juntas)
alter table public.user_settings add column if not exists usd_card_rate numeric(14, 2);
alter table public.user_settings add column if not exists usd_mep_rate numeric(14, 2);
alter table public.user_settings add column if not exists cards jsonb not null default '[]'::jsonb;
alter table public.user_settings add column if not exists savings jsonb not null default '[]'::jsonb;
-- Categorías propias: [{ id, name, emoji, kind: 'fijo'|'variable', archived }]
alter table public.user_settings add column if not exists categories jsonb not null default '[]'::jsonb;

-- ------------------------------------------------------------
-- Row Level Security: cada usuario ve y modifica SÓLO lo suyo.
-- Sin esto, cualquiera con la anon key podría leer todo.
-- ------------------------------------------------------------
alter table public.expenses enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "expenses: dueño" on public.expenses;
create policy "expenses: dueño" on public.expenses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "settings: dueño" on public.user_settings;
create policy "settings: dueño" on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- (Opcional) Para Power BI: categorías como tabla y una vista
-- con los nombres de columna que usan las medidas DAX.
-- ------------------------------------------------------------
create table if not exists public.categories (
  categoria_id text primary key,
  categoria    text not null,
  emoji        text not null,
  tipo         text not null check (tipo in ('fijo', 'variable'))
);

insert into public.categories (categoria_id, categoria, emoji, tipo) values
  ('vivienda', 'Vivienda', '🏠', 'fijo'),
  ('servicios', 'Servicios', '💡', 'fijo'),
  ('suscripciones', 'Suscripciones', '📺', 'fijo'),
  ('educacion', 'Educación', '📚', 'fijo'),
  ('supermercado', 'Supermercado', '🛒', 'variable'),
  ('comida-afuera', 'Comida afuera', '🍕', 'variable'),
  ('transporte', 'Transporte', '🚗', 'variable'),
  ('salud', 'Salud', '💊', 'variable'),
  ('ocio', 'Ocio', '🎬', 'variable'),
  ('ropa', 'Ropa', '👕', 'variable'),
  ('hogar', 'Hogar', '🛋️', 'variable'),
  ('mascotas', 'Mascotas', '🐾', 'variable'),
  ('regalos', 'Regalos', '🎁', 'variable'),
  ('viajes', 'Viajes', '✈️', 'variable'),
  ('otros', 'Otros', '📦', 'variable')
on conflict (categoria_id) do nothing;

alter table public.categories enable row level security;
drop policy if exists "categories: lectura" on public.categories;
create policy "categories: lectura" on public.categories for select to authenticated using (true);

-- Vista para Power BI (se consulta con un usuario de base de datos,
-- no con la anon key; ver docs/setup.md, paso 6).
-- Una fila por gasto y por mes en que se paga, igual que la pantalla Gastos:
--   · crédito con tarjeta → mes de vencimiento del resumen donde cae
--   · cuotas → una fila por cuota, cada una en su mes
--   · el resto → mes de la compra
-- "monto" es lo que se imputa a ese mes (la cuota); "monto_total", la compra entera. Clave: (id, cuota).
-- categoria / tipo salen de la tabla de fábrica o de las categorías propias del usuario.
drop view if exists public.bi_gastos;
create view public.bi_gastos as
select
  e.id,
  e.user_id,
  u.email          as usuario,
  e.date           as fecha,
  -- Cuotas en partes iguales; la última absorbe los centavos (igual que installmentAmount en la app)
  (case
     when q.n = 1 then e.amount
     when q.k = q.n - 1 then round(e.amount - floor(e.amount * 100 / q.n) / 100 * (q.n - 1), 2)
     else floor(e.amount * 100 / q.n) / 100
   end)::numeric(14, 2) as monto,
  e.category_id    as categoria_id,
  e.description    as descripcion,
  e.payment_method as medio_pago,
  e.currency       as moneda,
  e.original_amount as monto_original,
  card.value ->> 'name' as tarjeta,
  coalesce(cat.categoria, cc.value ->> 'name', e.category_id) as categoria,
  coalesce(cat.tipo, cc.value ->> 'kind', 'variable')         as tipo,
  q.n::smallint    as cuotas,
  -- Primer día del mes al que se imputa: el del vencimiento si es crédito con tarjeta; si no, el de la compra (+ n.º de cuota)
  coalesce(r.venc_mes, (date_trunc('month', e.date::timestamp) + make_interval(months => q.k))::date) as mes,
  r.vencimiento,
  (q.k + 1)::smallint as cuota,
  e.amount         as monto_total
from public.expenses e
join auth.users u on u.id = e.user_id
left join public.user_settings s on s.user_id = e.user_id
left join lateral jsonb_array_elements(s.cards) card on card.value ->> 'id' = e.card_id
left join public.categories cat on cat.categoria_id = e.category_id
left join lateral jsonb_array_elements(s.categories) cc on cc.value ->> 'id' = e.category_id
-- Una fila por cuota (k = 0 es la primera). Sólo hay cuotas en compras en pesos con crédito.
cross join lateral (
  select x.n, g.k
  from (select case when e.payment_method = 'credito' and e.currency <> 'USD' then greatest(e.installments, 1)::int else 1 end as n) x
  cross join generate_series(0, x.n - 1) as g(k)
) q
-- Resumen de la cuota k: si la compra es posterior al cierre de su mes, entra en el del mes siguiente.
-- Vence el mismo mes del cierre si dueDay > closingDay; si no, el mes siguiente.
-- Los días que no existen en un mes (31 en noviembre) pasan al último día, como en la app.
left join lateral (
  select
    v.venc_mes,
    (v.venc_mes + (least(c.due_day, extract(day from v.venc_mes + interval '1 month - 1 day')::int) - 1))::date as vencimiento
  from (
    select (card.value ->> 'closingDay')::int as closing_day, (card.value ->> 'dueDay')::int as due_day
  ) c
  cross join lateral (
    select (
      date_trunc('month', e.date::timestamp)
      + make_interval(months =>
          q.k
          + case
              when extract(day from e.date)
                   > least(c.closing_day, extract(day from date_trunc('month', e.date::timestamp) + interval '1 month - 1 day')::int)
              then 1 else 0
            end
          + case when c.due_day > c.closing_day then 0 else 1 end)
    )::date as venc_mes
  ) v
) r on e.payment_method = 'credito' and card.value is not null;

-- Saldos de ahorro en formato tabla (una fila por carga de saldo)
create or replace view public.bi_ahorros as
select
  s.user_id,
  u.email                                as usuario,
  acc.value ->> 'name'                   as cuenta,
  acc.value ->> 'kind'                   as tipo,
  acc.value ->> 'currency'               as moneda,
  (h.value ->> 'date')::date             as fecha,
  (h.value ->> 'amount')::numeric(14, 2) as saldo,
  nullif(h.value ->> 'mep', '')::numeric(14, 2) as mep
from public.user_settings s
join auth.users u on u.id = s.user_id
cross join lateral jsonb_array_elements(s.savings) acc
cross join lateral jsonb_array_elements(acc.value -> 'history') h;

-- Las vistas no se exponen a la API pública
revoke all on public.bi_gastos, public.bi_ahorros from anon, authenticated;
