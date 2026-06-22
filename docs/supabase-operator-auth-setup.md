# Supabase Foundation + Email-OTP Operator Auth — Setup & Verification

This guide covers the **human-in-the-loop** steps for the Supabase foundation and
email-OTP operator auth: provisioning the Supabase project, choosing the operator
allowlist, configuring the secrets, and verifying the auth gate end to end.

All Supabase variables are **server-only**. Do **not** prefix any of them with
`NEXT_PUBLIC_` — per [ADR-0019](adr/0019-server-side-persistence-and-single-operator-auth.md)
the browser reaches Supabase only through server routes, so the service-role key
must never reach the client bundle.

> **Behaviour when unconfigured.** If the four variables below are not all set,
> the app runs **open** (no auth gate) with the existing fixture/local
> fallbacks, so local development is unaffected. The operator gate only enforces
> once Supabase is fully configured.

---

## 1. Create the Supabase project

1. Sign in at <https://supabase.com> and create a **new project**. Pick a region
   close to where the app is deployed.
2. A new project automatically includes managed **Postgres**, **Storage**
   (object storage), and **Auth**. The auth gate itself needs no tables or
   buckets, but run persistence and image storage do: the SQL migrations under
   `supabase/migrations/` create the `generation_runs` table and the private
   `generated-images` storage bucket. Apply them with the Supabase CLI
   (`supabase db push`) or by pasting each file into the **SQL Editor** once the
   project exists.
3. Wait for the project to finish provisioning.

## 2. Configure email-OTP authentication

The product signs in with a **6-digit one-time code**, not a magic link.

1. **Auth → Providers → Email**: make sure the **Email** provider is **enabled**.
2. **Auth → Sign In / Providers (Email)**: keep **"Allow new users to sign up"
   enabled** for the first sign-in — each operator's account is created the first
   time their allowlisted email signs in. (You may disable it again once every
   teammate has signed in; our route-level allowlist already guarantees no other
   email is ever sent to Supabase.)
3. **Set up a custom SMTP sender (required on the Free plan).** The built-in
   Supabase email service is rate-limited and **does not let you customise the
   template**, so it keeps sending the default magic *link* instead of the
   numeric code we need. Without working SMTP, `signInWithOtp` fails with a
   Supabase-side `500` (surfaced in the app as a `502` on
   `POST /api/auth/request-code`, with the real error in the dev-server
   terminal). Wire up a free SMTP relay:
   - Create a free **[Brevo](https://www.brevo.com)** account. In Brevo go to
     **Settings → SMTP & API → "SMTP"**, read the host/port/login, and click
     **"Generate a new SMTP key"** to create the key Supabase will use as its
     SMTP password. Copy it.
   - **Verify a sender first.** In Brevo, **Senders, Domains & Dedicated IPs →
     Senders**, add and verify the exact address you'll send from. Brevo rejects
     mail from an unverified sender, which makes Supabase return the opaque 500.
   - In Supabase, **Auth → Emails → SMTP Settings**, enable **"Custom SMTP"** and
     map the fields precisely:

     | Supabase field | Brevo value |
     | --- | --- |
     | Host | `smtp-relay.brevo.com` |
     | Port | `587` |
     | Username / login | your Brevo **account login email** |
     | Password | the **SMTP key** (from "Your SMTP Settings" — *not* the API v3 key) |
     | Sender email | the **verified** sender address from the step above |
     | Sender name | e.g. `Auto-news` |

     Save. The two usual culprits are using the API key instead of the SMTP key,
     and a sender address that isn't verified in Brevo.
4. **Auth → Emails → Templates → "Magic Link"**: edit the template body so it
   sends the numeric token. It must contain **`{{ .Token }}`**, for example:

   ```html
   <h2>Your Auto-news sign-in code</h2>
   <p>Enter this code to sign in:</p>
   <p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
   ```

   If the template only has `{{ .ConfirmationURL }}` (the default link), the
   operator receives a link instead of a code and verification will fail.
5. (Optional) **Auth → Settings**: confirm the **OTP expiry** (default 3600s is
   fine) and email rate limits.

> **Diagnosing a `502` on "Send code":** the dev-server terminal now logs the
> exact Supabase error (`Operator sign-in code request failed. …`):
>
> - **`AuthRetryableFetchError` with `status: 500` and an empty body** — the
>   request reached Supabase but its auth server 500'd while sending mail. SMTP
>   is enabled but **the send was rejected**. Most common causes:
>   - **Brevo IP blocking is on.** If Brevo shows "Unauthorized IP addresses are
>     blocked for your SMTP keys", it rejects Supabase's (dynamic, un-allowlist-
>     able) sending IPs. Fix: **Brevo → Settings → Security → "Deactivate for
>     SMTP keys"**. Do not try to authorize an IP — Supabase's sending IP is not
>     fixed.
>   - **Unverified sender** (Brevo → Senders) or a wrong SMTP key/port in the
>     step-3 field mapping.
> - **`Error sending confirmation email` / `Error sending magic link email`** —
>   SMTP isn't set up yet (still on the default email service). Do step 3.
> - A **`400`/`422` with a template message** — the "Magic Link" template
>   (step 4) has a broken `{{ … }}` tag; fix the template body.
>
> Supabase SMTP/template settings are remote, so changes take effect on the next
> "Send code" without restarting the app.

## 3. Collect the three keys

In **Project Settings → API**:

| Variable | Where to find it |
| --- | --- |
| `SUPABASE_URL` | "Project URL" |
| `SUPABASE_ANON_KEY` | "Project API keys" → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | "Project API keys" → `service_role` `secret` |

## 4. Choose the operator allowlist

Pick the **set** of emails that own the tool, comma-separated. Signup is
restricted to these addresses — every other email is refused a code — and each
provisions its own Operator Account on first sign-in. Values are normalized
(trimmed + lower-cased) and de-duplicated; unset/empty means nobody is allowed.

The **first entry is the Primary Operator** and is load-bearing: the unattended
Discovery Sweep anchors its dedup state and the single expensive composition under
it. Always **append** new teammates — reordering or removing the first entry
re-anchors discovery under empty state and can start duplicate runs.

| Variable | Value |
| --- | --- |
| `OPERATOR_ALLOWLISTED_EMAILS` | comma-separated operator emails; the first is the Primary Operator (e.g. `you@example.com,teammate@example.com`) |

## 5. Set the environment variables

**Local development** — add to `.env.local` (see `.env.example` for the block):

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
OPERATOR_ALLOWLISTED_EMAILS=you@example.com,teammate@example.com
```

Then **restart `npm run dev`** so the new env is loaded.

**Production (Vercel)** — Settings → Environment Variables → add the same four
keys (no `NEXT_PUBLIC_` prefix), then redeploy.

## 6. Verify

Run through these once the variables are set and the server is restarted:

1. **Runtime Status reports the boundary.** Open
   `http://localhost:3000/api/runtime-status` (you'll need to be signed in, or
   check after step 4 below) and confirm:
   ```json
   "persistence": { "mode": "live", "credentials": { "supabaseUrl": true,
     "supabaseAnonKey": true, "supabaseServiceRoleKey": true,
     "operatorAllowlistedEmail": true } }
   ```
2. **Unauthenticated workspace is gated.** In a fresh/incognito browser, visit
   `http://localhost:3000/` → you should be redirected to `/sign-in`.
3. **Unauthenticated runs API is rejected.** `curl -i http://localhost:3000/api/generation-runs/stream`
   → should return **401** (not a stream). The same deny-by-default gate also protects the
   persisted-runs API at `/api/runs/*`.
4. **Allowlisted sign-in works.** On `/sign-in`, enter the allowlisted email →
   "Send code" → check your inbox for the 6-digit code → enter it → "Verify and
   sign in" → you land on the workspace.
5. **Non-allowlisted email is refused.** Enter any other email → "Send code" →
   you should see **"This email is not allowed to sign in."** and no email is
   sent.
6. **Cross-device continuity.** Sign in from a second browser/device with the
   same allowlisted email + a fresh code → you reach the **same** Operator
   Account. (A second *teammate* signs in with their own allowlisted email and
   gets their own account; automated-run fan-out across operators is
   implemented — each finished Automated Run is copied into every other signed-in
   operator's account — see [ADR-0024](adr/0024-multi-operator-allowlist-and-automated-run-fan-out.md).)

> ⚠️ Heads-up for local verification: the dev server uses your **live, paid**
> generation/retrieval APIs. Signing in is free, but do not start a real
> Generation Run during this check unless you intend to spend quota.

When all six pass, the operator auth gate is correctly configured. Ping back with any
step that fails and the exact response you saw.
