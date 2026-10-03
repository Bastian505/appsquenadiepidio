-- Los tokens de los links salían con "==" al final (base64 con relleno): 24 caracteres en vez de 22.
-- Desde ahora se generan sin relleno. Los tokens ya creados siguen funcionando (el cliente acepta ambos).
-- Aplicar en: Supabase → SQL Editor → pegar → Run. Es idempotente.
alter table public.dc_bills
  alter column share_token
  set default replace(replace(replace(encode(gen_random_bytes(16), 'base64'), '/', '_'), '+', '-'), '=', '');
