-- ============================================================================
-- DiviCuenta — Row Level Security baseline
-- ============================================================================
--
-- CONTEXT (read this before running):
--
-- This app has NO real authentication. The browser talks directly to
-- Supabase with the public anon key (hardcoded in index.html /
-- apps/divicuenta/index.html), and "who can write what" today is enforced
-- only by client-side JavaScript convention (e.g. "update participants
-- where id = myParticipantId"). Nothing stops any anon-key holder — which
-- is anyone, since the key ships in the public HTML — from reading or
-- writing ANY row in ANY table via the raw PostgREST API.
--
-- This migration turns RLS on everywhere and adds policies that:
--   1. Make that egregious case (full-table read/write/delete by anyone,
--      including tables never even meant to be read by a browser, like
--      dc_users' phone numbers or the OCR telemetry tables) impossible.
--   2. Preserve the app's actual required behavior, which depends on
--      "knowing a session_id/participant_id is enough to act on it" —
--      the app's model is closer to "possession of an unguessable link"
--      (like a Google Docs share link) than to per-user accounts.
--
-- IMPORTANT LIMITATION — please read:
-- Because there is no auth.uid() to key policies off of, RLS CANNOT
-- prevent someone who has *a* valid session_id from reading *other*
-- people's sessions/participants if they simply omit the `id=eq.…`
-- filter and page through the table (RLS filters rows, it does not
-- require a request to filter by a specific column). The policies below
-- still deny DELETE everywhere (the app never deletes, so this is free
-- hardening) and fully lock down tables the browser should never read at
-- all (dc_users, ocr_runs, ocr_items, merchant_observations). But
-- `sessions` and `participants` keep an open-ish SELECT because the app's
-- join-by-QR-code flow requires it and there is no server-side session to
-- scope by otherwise.
--
-- To close that gap for real, in order of effort:
--   (a) Ship the crypto.randomUUID() fix (see the app's index.html) so
--       session/participant IDs are 122-bit-unguessable — this makes
--       *targeted* access to someone else's session practically
--       impossible even though a full-table dump is still technically
--       not blocked by RLS alone.
--   (b) Move all "read by id" access behind Postgres RPC functions
--       (`get_session(p_id uuid)`, `get_participants(p_session_id uuid)`)
--       declared SECURITY DEFINER, REVOKE the underlying SELECT grant
--       from anon entirely, and GRANT EXECUTE on the RPCs instead. A
--       function argument is impossible to enumerate the way a bare
--       `?select=*` table scan is.
--   (c) The real fix: adopt Supabase Anonymous Auth
--       (`supabase.auth.signInAnonymously()`) so every browser gets a
--       stable `auth.uid()`, store that uid on `participants.user_id` and
--       `dc_users.id`, and rewrite policies as
--       `USING (user_id = auth.uid())`. This is the only way to make
--       "each participant can only touch their own row" actually true at
--       the database level instead of by client convention. Happy to
--       implement (b) or (c) as a follow-up if you want — this migration
--       only does the immediately-deployable baseline (this file's
--       policies), which is a large improvement over the current
--       no-RLS-at-all state but is not equivalent to (c).
--
-- HOW TO APPLY:
-- Run this file in the Supabase SQL editor (Dashboard → SQL Editor →
-- New query → paste → Run), or via the Supabase CLI:
--   supabase db push
-- Before running, check the Dashboard → Authentication → Policies page
-- for any existing policies on these tables so you don't end up with
-- duplicates/conflicts — this environment could not reach your Supabase
-- project to check for you (outbound network here is allowlisted and
-- does not include supabase.co).
-- ============================================================================


-- ── sessions ─────────────────────────────────────────────────────────────
-- Columns used by the app: id, restaurante, items (jsonb), tip_pct,
-- people_list (jsonb), assigns_data (jsonb).
-- Written via upsert() by whoever hosts a group session; read via
-- .eq('id', sid) by whoever opens the join link/QR code.

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_anon" ON public.sessions;
CREATE POLICY "sessions_select_anon"
  ON public.sessions FOR SELECT
  TO anon
  USING (true);
  -- LIMITATION: does not stop a full-table scan, only removes the
  -- possibility of this being *more* open than intended (e.g. a future
  -- misconfigured GRANT). See RPC/anon-auth recommendation above.

DROP POLICY IF EXISTS "sessions_insert_anon" ON public.sessions;
CREATE POLICY "sessions_insert_anon"
  ON public.sessions FOR INSERT
  TO anon
  WITH CHECK (id IS NOT NULL);

DROP POLICY IF EXISTS "sessions_update_anon" ON public.sessions;
CREATE POLICY "sessions_update_anon"
  ON public.sessions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (id IS NOT NULL);
  -- LIMITATION: any anon holder can update ANY session's id, not just
  -- ones they created — again, only fixable with real per-user identity.

-- No DELETE policy → DELETE is denied by default once RLS is enabled.
-- The app never deletes sessions, so this is a pure hardening with no
-- functional cost.


-- ── participants ─────────────────────────────────────────────────────────
-- Columns used: id, session_id, name, color, assigns (jsonb),
-- my_assigns (jsonb).
-- Inserted by anyone joining a session; each participant updates only
-- their own row by client convention (`.eq('id', myParticipantId)`),
-- which RLS cannot verify without auth (see limitation above).

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_select_anon" ON public.participants;
CREATE POLICY "participants_select_anon"
  ON public.participants FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "participants_insert_anon" ON public.participants;
CREATE POLICY "participants_insert_anon"
  ON public.participants FOR INSERT
  TO anon
  WITH CHECK (session_id IS NOT NULL AND name IS NOT NULL);

DROP POLICY IF EXISTS "participants_update_anon" ON public.participants;
CREATE POLICY "participants_update_anon"
  ON public.participants FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (session_id IS NOT NULL);
  -- LIMITATION: cannot restrict "only your own participant row" without
  -- auth.uid(); see recommendation (c) above.

-- No DELETE policy → denied by default. The app never deletes participants.


-- ── dc_corrections ───────────────────────────────────────────────────────
-- Write-only analytics/telemetry the client sends to help improve OCR
-- (raw receipt lines, corrections the user made). Never read back by the
-- client, so there is no reason anon should be able to SELECT it —
-- especially since it can contain raw OCR text from photographed receipts.

ALTER TABLE public.dc_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dc_corrections_insert_anon" ON public.dc_corrections;
CREATE POLICY "dc_corrections_insert_anon"
  ON public.dc_corrections FOR INSERT
  TO anon
  WITH CHECK (true);

-- Deliberately no SELECT/UPDATE/DELETE policy for anon: this table is
-- insert-only telemetry from the app's point of view. Read it from the
-- Supabase dashboard (as the project owner) or a service-role context.


-- ── dc_users ─────────────────────────────────────────────────────────────
-- Contains name + PHONE NUMBER (PII). The client only ever upserts its
-- own local profile here and never reads it back — so anon should have
-- zero SELECT access. Without this, anyone with the (public) anon key
-- could dump every user's phone number.

ALTER TABLE public.dc_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dc_users_insert_anon" ON public.dc_users;
CREATE POLICY "dc_users_insert_anon"
  ON public.dc_users FOR INSERT
  TO anon
  WITH CHECK (id IS NOT NULL AND name IS NOT NULL);

DROP POLICY IF EXISTS "dc_users_update_anon" ON public.dc_users;
CREATE POLICY "dc_users_update_anon"
  ON public.dc_users FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (id IS NOT NULL);
  -- LIMITATION: same "no auth" caveat — anyone could upsert over another
  -- user's row if they guessed/obtained their id. IDs are currently
  -- generated client-side as 'u_' + Date.now() + Math.random() (see the
  -- separate fix for weak ID generation) — low entropy today, improved
  -- once switched to crypto.randomUUID().

-- Deliberately no SELECT policy for anon: protects phone numbers from
-- being dumped via the public anon key.


-- ── dc_debts ─────────────────────────────────────────────────────────────
-- The weakest table in the schema from a security-model standpoint: rows
-- are matched by free-text `from_name`/`to_name` (case-insensitive),
-- there is no link to dc_users.id or any authenticated identity, and the
-- app itself lets a user claim to be anyone just by typing a name in the
-- onboarding form. RLS cannot fix a "the client's claimed name is
-- trusted" design bug — it can only stop this table being *additionally*
-- readable/writable with zero constraints at all.
--
-- Real fix: add a `user_id` column referencing dc_users(id), populate it
-- from an authenticated context (Supabase Anonymous Auth — see
-- recommendation (c) above), and scope policies on `user_id = auth.uid()`
-- instead of on name strings.

ALTER TABLE public.dc_debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dc_debts_select_anon" ON public.dc_debts;
CREATE POLICY "dc_debts_select_anon"
  ON public.dc_debts FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "dc_debts_insert_anon" ON public.dc_debts;
CREATE POLICY "dc_debts_insert_anon"
  ON public.dc_debts FOR INSERT
  TO anon
  WITH CHECK (from_name IS NOT NULL AND to_name IS NOT NULL AND amount IS NOT NULL);

DROP POLICY IF EXISTS "dc_debts_update_anon" ON public.dc_debts;
CREATE POLICY "dc_debts_update_anon"
  ON public.dc_debts FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
  -- LIMITATION: this still allows anyone to mark any debt as paid, same
  -- as today. Fixing it requires the real-identity redesign above; this
  -- migration does not change dc_debts' functional exposure, only turns
  -- on RLS so it isn't *more* open than these explicit policies.

-- No DELETE policy → denied by default.


-- ── ocr_runs / ocr_items / merchant_observations ────────────────────────
-- Written exclusively by api/scan-receipt.js (server-side), currently
-- using the anon key (see the separate finding recommending it switch to
-- the service_role key instead, which would let you drop these INSERT
-- policies entirely and rely on RLS default-deny for anon). The browser
-- never reads or writes these directly — lock them down completely for
-- anon except the inserts the current server code needs.

ALTER TABLE public.ocr_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ocr_runs_insert_anon" ON public.ocr_runs;
CREATE POLICY "ocr_runs_insert_anon"
  ON public.ocr_runs FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "ocr_items_insert_anon" ON public.ocr_items;
CREATE POLICY "ocr_items_insert_anon"
  ON public.ocr_items FOR INSERT
  TO anon
  WITH CHECK (run_id IS NOT NULL);

DROP POLICY IF EXISTS "merchant_observations_insert_anon" ON public.merchant_observations;
CREATE POLICY "merchant_observations_insert_anon"
  ON public.merchant_observations FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "merchant_observations_update_anon" ON public.merchant_observations;
CREATE POLICY "merchant_observations_update_anon"
  ON public.merchant_observations FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
  -- Needed because scan-receipt.js upserts with
  -- Prefer: resolution=merge-duplicates, which performs an UPDATE on
  -- conflict.

-- Deliberately no SELECT policy on any of the three: this data (raw OCR
-- extraction confidence, receipt line items, which POS system a merchant
-- uses) has no reason to ever be readable via the public anon key.
-- Recommended follow-up: switch api/scan-receipt.js to use
-- SUPABASE_SERVICE_ROLE_KEY (server-only secret, never shipped to the
-- browser) instead of the anon key for these three inserts, then these
-- INSERT policies can be dropped too and RLS's default-deny covers
-- everything for anon.


-- ============================================================================
-- Verify after applying: as a logged-out (anon) user, the following should
-- now fail/return empty:
--   select * from dc_users;
--   select * from ocr_runs;
--   select * from ocr_items;
--   select * from merchant_observations;
--   delete from sessions where id = '<anything>';
-- ============================================================================
