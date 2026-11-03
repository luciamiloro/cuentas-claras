-- ============================================================
-- Cuentas Claras — migración: bi_gastos imputado por mes de pago
-- Para un proyecto que ya corrió schema.sql antes de esta versión.
-- Correlo en Supabase → SQL Editor DESPUÉS de migrations-cuotas.sql.
-- No toca tablas (sólo la vista), así que el orden con el deploy del front da igual.
-- Se puede re-ejecutar sin problema.
--
-- Qué cambia: bi_gastos pasa a tener una fila por gasto y por mes en que se paga,
-- igual que la pantalla Gastos de la app:
--   · crédito con tarjeta → mes de vencimiento del resumen donde cae
--     (compra del 21/10, tarjeta que cierra el 29 y vence el 11 → noviembre)
--   · cuotas → una fila por cuota, cada una en su mes
--   · el resto → mes de la compra
-- "monto" es lo que se imputa a ese mes (la cuota); "monto_total", la compra entera.
-- Clave única: (id, cuota). Columnas nuevas al final: mes, vencimiento, cuota, monto_total.
-- ============================================================

-- Se recrea (no "create or replace") porque cambia de una fila por gasto a una por cuota
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

-- La vista no se expone a la API pública
revoke all on public.bi_gastos from anon, authenticated;
