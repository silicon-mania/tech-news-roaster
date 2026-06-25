# CLAUDE.md

Guidance for AI agents working on **Tech News Roaster**. This file covers UI, UX,
and code-organization conventions. For domain language and architecture decisions,
read [CONTEXT.md](CONTEXT.md) and the ADRs under [docs/adr/](docs/adr/).

## Stack

- **Next.js 16** (App Router) + **React 19**, TypeScript.
- **Tailwind CSS v4** with CSS custom properties (see `src/app/globals.css`).
- **Biome** for lint/format (`npm run lint`). There is no Prettier — do not add it.
- **Vitest** + Testing Library, tests co-located as `*.test.ts(x)`.

## UI components

- **Build every component from [shadcn/ui](https://ui.shadcn.com) primitives.**
  Reach for a shadcn primitive before hand-rolling markup. Compose primitives
  into feature components rather than duplicating their internals.
- shadcn is **installed** (components land in `src/components/ui/`). Add new
  primitives as needed: `npx shadcn@latest add <name>`. `button`, `skeleton`,
  `sonner`, and `tooltip` are already in.
- **One palette, no second color system.** The brand theme in
  `src/app/globals.css` is the source of truth (`--background`, `--foreground`,
  `--muted`, `--panel`, `--panel-strong`, `--line`, `--accent`, `--accent-strong`,
  `--success`, `--danger`; dark-only). shadcn's semantic tokens are wired onto it
  in the `@theme inline` block — note that `--muted` and `--accent` mean
  text/link colors here, so shadcn's surface variants are mapped to `--panel*`
  instead. When a new primitive needs a token, map it there; do **not** add a
  competing set of color variables.
- **Signal palette = the one color system** (ADR-0030, "Signal Desk"). *Black and
  white are the brand; color is the signal.* The six `--signal-*` vars
  (green/yellow/orange/red/purple/blue) **mirror** `categoryBandColors` in
  `src/services/generation/news-category.ts` — that map stays authoritative for
  per-run band colors; the vars just name the same hexes for UI chrome (a card's
  stripe == its poster band). Status tokens ride the signals: `--success` = green,
  `--warning` = yellow, `--danger` = red. Color is a **hint, not a unique key**
  (six hues, ten categories), so always pair a signal color with the category
  **word**. Reach for color only when it *means* a category or a run state — the
  canvas is otherwise silent neutral type on near-black (no decorative washes).
- **Display tier.** `.display-locked` / `--font-display` (CompactaICG, heavy
  condensed italic, all-caps) is the brand "signal word" voice — e.g. the Run
  Card's News Category label. `.title-serif` (Henrietta) still styles section
  titles; its migration to the display tier is staged (ADR-0030).
- The app is **dark-only**: `<html>` carries the `dark` class so shadcn's
  `dark:` variants apply, and there is no theme toggle or `next-themes`.
  - **One sanctioned exception:** the Final Quote Tweet Image overlay
    (`src/components/workspace/final-quote-tweet-image-overlay.tsx`) uses a
    light/white card surface — it mats the print-like composite. Keep it
    self-contained with scoped `bg-white` / `text-zinc-*` utilities (and
    `dark:hover:*` overrides so the dark-root ghost variants don't leak in);
    it adds **no** light-theme tokens. Don't "fix" it back to dark tokens, and
    don't treat it as license for a second theme anywhere else.

## Visual style

- **Minimalist and thin.** Favor whitespace and type hierarchy over chrome.
- **Avoid borders.** Separate regions with spacing, subtle background shifts
  (`--panel` / `--panel-strong`), or weight — not lines. Reach for `--line`
  only when a divider is genuinely necessary.
- Keep the dark, editorial feel already established in `globals.css`.

## Actions & buttons

- **Prefer an icon-only action over a labeled button.** An action should be a
  single [lucide-react](https://lucide.dev) icon with **ghost** styling
  (`variant="ghost"`), not a button with text or text + icon.
- Always give icon-only actions an accessible label (`aria-label`) and, where
  helpful, a tooltip — the icon must be understandable without visible text.
- Use a labeled button only for primary, ambiguous, or destructive actions
  where an icon alone would be unclear.

## Loading & feedback

- **Skeletons, not spinners, for loading data.** Use shadcn's `Skeleton` to
  reserve layout while data loads. The skeleton must match the final content's
  footprint so there is **no layout shift** when data arrives.
- **Quiet feedback via [sonner](https://sonner.emilkowal.ski/) toasts.** Use
  toasts for low-friction confirmations and non-blocking errors — "Text copied",
  "An error occurred, check your screen", etc. Don't block the UI with modals
  or alerts for routine feedback. Mount `<Toaster />` once at the app root.

## File & folder organization

- **Keep files small and single-responsibility.** No hard line limit, but a file
  that's doing several jobs (or scrolling forever) should be split. Many small,
  well-named files beat a few large ones. Long files are a DX failure, not a
  neutral choice — the current `src/features/*` modules grew to ~1000-line files
  and are painful to work in; that is exactly what to avoid.
- **Organize by type, namespaced by feature.** The target layout is:
  - `src/app/` — Next.js routes, layouts, API handlers
  - `src/components/<feature>/` — feature UI components (`src/components/ui/` is
    reserved for shadcn primitives)
  - `src/services/<feature>/` — feature logic / data services
  - `src/types/` — shared cross-feature types (created on demand; feature-local
    types stay in their feature/service folder)
  - `src/utils/` — shared utilities
  - `src/lib/` — third-party glue (e.g. shadcn's `cn`)
- Files are **kebab-case**. Co-locate tests next to their subject as
  `*.test.ts(x)`. Use an `index.ts` barrel per component and service folder —
  the barrel is the feature's public contract; do not deep-import past it.
  Exception: server-only modules (e.g. `generation-orchestrator`) are imported
  directly by routes and stay out of the `services/generation` barrel so client
  bundles never pull in server code.
- The migration out of `src/features/*` is **complete** — the tree above is the
  live layout (folders are created as needed: `src/types/` appears only once a
  type is genuinely shared across features). Put new code in the matching folder.

## Documentation

The docs sit in three tiers by **durability** — know which tier you're touching.

- **Durable truth — keep and maintain.** The code and its tests, [CONTEXT.md](CONTEXT.md)
  (the domain language), and the **active ADRs** under [docs/adr/](docs/adr/) (the
  decisions). Together these *are* the spec. If another doc conflicts with them, the
  other doc is wrong — fix or delete it; never reshape the code to match a stale doc.
- **Ephemeral plans — delete once shipped.** PRDs and the issues under
  `.grilled/issues/` are planning scaffolding for one cycle of `grill → to-prd →
  to-issues → implement-next-issue`. Before the work merges, capture any lasting
  decision in an ADR (and any new term in CONTEXT.md); then the plan is disposable.
  Do **not** accumulate superseded PRDs — agents read them as current and get misled.
- **Ops runbooks — keep, but maintain.** Deployment and setup guides under
  [docs/](docs/) go stale silently; update them in the same change that alters the
  thing they describe.

Conventions:

- **ADRs are the decision log.** Maintain supersession links in **both** directions:
  when a new ADR reverses an old one, add a forward "amended/superseded by" banner to
  the old ADR too, not just a back-link in the new one. Delete a fully-superseded ADR
  only when its superseder already carries the rejected option's rationale **and** you
  have removed the now-dangling links.
- **CONTEXT.md is a glossary, not a changelog.** Define a term's current meaning;
  don't narrate how it used to be ("no longer the landing page", "preserved from
  earlier versions") — that history lives in an ADR. Drop a term's version tag once the
  behavior is simply current (keep it only to mark a genuinely retired term).

## Workflow

- Run `npm run lint` (Biome, auto-fixes) and `npm run typecheck` before finishing.
- Run `npm test` for affected areas; add/adjust co-located tests with changes.
