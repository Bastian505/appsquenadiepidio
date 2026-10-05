# Cuota de lecturas y registro de uso

Protege tu saldo de la API (nadie puede escanear sin límite) y te da, por primera vez, **datos reales de uso**: cuántas boletas se leen, de qué países, con qué modelo, cuánto cuestan y cuántas cuadran.

No guarda nada de la boleta: ni la imagen, ni los ítems, ni los precios. Solo: usuario anónimo (un identificador al azar), fecha, país, modelo, si la suma cuadró, cantidad de ítems y costo estimado.

## Cómo se activa (2 pasos, en este orden)

1. **Supabase → SQL Editor:** pega y ejecuta el contenido de `supabase/migrations/20261007_scan_quota.sql`.
2. **Vercel → Settings → Environment Variables:** agrega `SCAN_QUOTA_PER_MONTH` = `30` (lecturas por usuario por mes; cámbialo cuando quieras) y haz Redeploy.

Opcional: `SCAN_GLOBAL_DAILY_LIMIT` = `500` (tope de lecturas por día de **toda la app**: el freno de emergencia si algo se viraliza o alguien abusa).

Sin `SCAN_QUOTA_PER_MONTH` no cambia nada: la cuota está apagada y no se llama a Supabase. Si algún día quieres apagarla, borra la variable y redeploy.

> Importante: ejecuta el paso 1 **antes** del 2. Si activas la cuota sin la migración, Supabase no tiene las funciones y el servidor deja pasar todas las lecturas (falla abierta, queda un aviso `QUOTA_UNAVAILABLE` en los logs), o sea no protege.

## Qué ve el usuario

- Nada, mientras le queden lecturas.
- Cuando le quedan 2 o menos: "Boleta leída · te quedan 1 lectura este mes".
- Si se agotan: "Llegaste al límite de 30 lecturas de este mes. Puedes ingresar los ítems a mano." (la app sigue funcionando a mano).
- Un escaneo que falla (foto ilegible, error de la IA) **se devuelve**: no cuenta.
- Las boletas con moneda ambigua (`$` sin país claro) cuentan dos veces: la lectura y la confirmación del país.

## Cómo ver el uso (Supabase → SQL Editor)

```sql
-- Resumen por mes: lecturas, usuarios distintos, costo y % que cuadra
select to_char(created_at, 'YYYY-MM') as mes, count(*) as lecturas, count(distinct user_id) as usuarios,
       round(sum(cost_cents) / 100, 2) as costo_usd,
       round(avg(cost_cents), 2) as centavos_por_lectura,
       round(100.0 * count(*) filter (where cuadra) / nullif(count(*) filter (where cuadra is not null), 0), 1) as pct_cuadra
from dc_scan_log where status = 'ok' group by 1 order by 1 desc;

-- Por país (dónde falla más)
select country, count(*) as lecturas, round(100.0 * count(*) filter (where cuadra) / nullif(count(*), 0), 1) as pct_cuadra
from dc_scan_log where status = 'ok' group by 1 order by 2 desc;

-- Los 10 usuarios que más usan (para ver si alguien abusa)
select user_id, count(*) as lecturas, round(sum(cost_cents) / 100, 2) as costo_usd
from dc_scan_log where status = 'ok' and created_at >= date_trunc('month', now()) group by 1 order by 2 desc limit 10;

-- Lecturas por día (últimos 14)
select date_trunc('day', created_at)::date as dia, count(*) from dc_scan_log where status = 'ok' group by 1 order by 1 desc limit 14;
```

Con 2 semanas de uso real, `centavos_por_lectura` y `lecturas por usuario` te dicen cuánto cuesta atender a un usuario al mes: ese es el número que falta para decidir cuánto cobrar.

## Límites (qué NO cubre)

- La traducción de nombres y "asignar hablando" (`/api/translate`, `/api/assign`) usan el modelo barato y solo tienen el límite por minuto por IP; no cuentan en la cuota. Son centésimas de centavo por uso.
- La identidad es una sesión anónima: quien borre los datos del navegador obtiene un usuario nuevo y otra cuota. Es un freno contra el abuso casual, no contra alguien decidido; para eso está el tope diario global y el límite de gasto en la consola de Anthropic (configúralo igual).
- El costo es una **estimación** con las tarifas de la tabla de `api/_lib/quota.js`, no la factura. Compara con la consola de Anthropic.
