-- ============================================================
-- Cuentas Claras — migración: compras en cuotas
-- Para un proyecto que ya corrió schema.sql antes de esta versión.
-- Correlo en Supabase → SQL Editor DESPUÉS de migrations-categorias.sql
-- y ANTES de deployar el front nuevo. Se puede re-ejecutar sin problema.
-- ============================================================

-- Cuotas: "amount" es siempre el total; los resúmenes de la tarjeta lo reparten en cuotas
alter table public.expenses add column if not exists installments smallint not null default 1 check (installments between 1 and 48);

-- bi_gastos con la columna "cuotas" agregada al final
create or replace view public.bi_gastos as
select
  e.id,
  e.user_id,
  u.email          as usuario,
  e.date           as fecha,
  e.amount         as monto,
  e.category_id    as categoria_id,
  e.description    as descripcion,
  e.payment_method as medio_pago,
  e.currency       as moneda,
  e.original_amount as monto_original,
  card.value ->> 'name' as tarjeta,
  coalesce(cat.categoria, cc.value ->> 'name', e.category_id) as categoria,
  coalesce(cat.tipo, cc.value ->> 'kind', 'variable')         as tipo,
  e.installments   as cuotas
from public.expenses e
join auth.users u on u.id = e.user_id
left join public.user_settings s on s.user_id = e.user_id
left join lateral jsonb_array_elements(s.cards) card on card.value ->> 'id' = e.card_id
left join public.categories cat on cat.categoria_id = e.category_id
left join lateral jsonb_array_elements(s.categories) cc on cc.value ->> 'id' = e.category_id;

-- La vista no se expone a la API pública
revoke all on public.bi_gastos from anon, authenticated;
