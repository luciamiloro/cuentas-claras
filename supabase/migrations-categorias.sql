-- ============================================================
-- Cuentas Claras — migración: categorías personalizadas
-- Para un proyecto que ya corrió schema.sql antes de esta versión.
-- Correlo en Supabase → SQL Editor ANTES de deployar el front nuevo
-- (la app pide la columna "categories" al leer las preferencias).
-- Se puede re-ejecutar sin problema.
-- ============================================================

-- Categorías propias: [{ id, name, emoji, kind: 'fijo'|'variable', archived }]
alter table public.user_settings add column if not exists categories jsonb not null default '[]'::jsonb;

-- bi_gastos con nombre y tipo de la categoría (de fábrica o propia), agregados al final
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
  coalesce(cat.tipo, cc.value ->> 'kind', 'variable')         as tipo
from public.expenses e
join auth.users u on u.id = e.user_id
left join public.user_settings s on s.user_id = e.user_id
left join lateral jsonb_array_elements(s.cards) card on card.value ->> 'id' = e.card_id
left join public.categories cat on cat.categoria_id = e.category_id
left join lateral jsonb_array_elements(s.categories) cc on cc.value ->> 'id' = e.category_id;

-- La vista no se expone a la API pública
revoke all on public.bi_gastos from anon, authenticated;
