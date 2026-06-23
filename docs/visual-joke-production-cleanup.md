# Visual Joke — production cleanup checklist (one-time closeout)

The Visual Joke feature has been fully removed from the codebase (PRD
`docs/prds/remove-visual-joke-generation.md`, ADR-0026). This is the **operator-run**
closeout that guarantees nothing visual-joke remains in the production or operational
surface. An agent prepared this list and edited the runbook; **a human must perform the
production-environment removals below** — agents must not mutate production credentials or
configuration.

Work top to bottom. Every category the visual-joke feature could have touched is listed,
each with a concrete action or an explicit **Nothing to do** note, so you can confirm
nothing is left behind. Once every box is ticked and the final verification passes, delete
this file and the closeout pointer in `docs/deployment.md`.

## 1. Environment variables (Vercel dashboard → Settings → Environment Variables)

- [ ] **Remove `AI_GATEWAY_VISUAL_JOKE_MODEL`** from **Production**, **Preview**, and
      **Development** environments. This is the only visual-joke-specific variable; after
      removing it, no environment in any scope should still define it.
- [ ] Every other variable (`AI_GATEWAY_API_KEY` / `VERCEL_AI_GATEWAY_API_KEY`,
      `AI_GATEWAY_OPENAI_MODEL`, `AI_GATEWAY_ANTHROPIC_MODEL`, `AI_GATEWAY_GOOGLE_MODEL`,
      `AI_GATEWAY_IMAGE_MODEL`, the enrichment, Supabase, discovery, and `APP_BASE_URL`
      vars) is **not** visual-joke-specific — **keep them**. Nothing to do.

## 2. Secrets / API keys

- [ ] Visual joke generation reused the shared `AI_GATEWAY_API_KEY`; it never had its own
      key or secret. **Nothing to do** — do not rotate or remove any other secret.

## 3. Local / per-developer env files

- [ ] Remove the `AI_GATEWAY_VISUAL_JOKE_MODEL` line (and its comment) from any local
      `.env.local` and `.env.production` on developer machines. These files are git-ignored,
      so merging the code change does not clean them. The tracked template `.env.example`
      was already cleaned when the backend was torn down (issue 004).

## 4. URLs / endpoints

- [ ] No visual-joke-specific route, webhook, or external endpoint ever existed — visual
      jokes were generated in-process through the AI Gateway, not via a dedicated URL.
      **Nothing to do.**

## 5. Storage buckets (Supabase)

- [ ] The only storage bucket is `generated-images` (generated image bytes). No visual-joke
      bucket ever existed — visual jokes lived in the run-payload JSON, not in storage.
      **Nothing to do** — do not delete `generated-images`.

## 6. Cron / feature configuration

- [ ] `vercel.json` defines only the `/api/discovery-sweep` cron; there is no visual-joke
      cron or feature flag anywhere in the hosting config. **Nothing to do.**

## 7. AI Gateway model catalog (optional)

- [ ] The visual-joke model (`openai/gpt-5.5` by default) may have been enabled in the
      Vercel AI Gateway catalog solely for visual jokes. If **nothing else** selects it, you
      may disable it in the gateway to shrink surface. This is **optional** and only safe if
      no other feature references that model — text generation uses the OpenAI/Anthropic/
      Google model IDs above, not the visual-joke model.

## 8. Dashboards / alerts / monitoring

- [ ] No dedicated visual-joke dashboard, metric, or alert was provisioned. Confirm in your
      observability tooling (Vercel logs/analytics and any external monitoring) that no alert
      or saved query references `AI_GATEWAY_VISUAL_JOKE_MODEL` or "visual joke". Expected
      result: **Nothing to do.**

## 9. Final verification

- [ ] Redeploy after removing the variable(s).
- [ ] Open `https://<your-production-domain>/api/runtime-status` and confirm
      `productionReady: true`, every configured text and image model `available: true`, and
      **no visual-joke boundary** in the response.
- [ ] Run one manual generation (or open an automated run) end to end and confirm it reaches
      a composed Final Quote Tweet Image with the fixed `LABEL GOES HERE` placeholder — no
      visual-joke area and no error referencing a visual-joke model.
- [ ] Sign off: the "Visual Joke" chapter is fully closed. Delete this file and the closeout
      pointer in `docs/deployment.md`.
