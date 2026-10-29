# AGENTS.md — rules for AI agents building a Next.js app with @wakii/ui-kit

Next.js App Router + **@wakii/ui-kit** (verified on Next 16 — no transpilePackages needed).
References: [Wakii repo AGENTS.md](https://github.com/wakii-dev/microservice_microfrontend_starter/blob/main/AGENTS.md) ·
[Live Storybook](https://storybook-static-khaki-two.vercel.app).

## Working agreement (wakii ecosystem v0.2 — 2026-10-29)

- **Input gate**: AI asks ONCE for direction on large work, then runs autonomously; stops only for permissions/spending.
- **Quality = machine gates** (`pnpm build` + tests green = pass). No per-change human review.
- **This app is private** — no npm publish from here.
- **Multi-session**: small scoped commits; follow the upstream [WORKFLOW](https://github.com/wakii-dev/microservice_microfrontend_starter/blob/main/docs/WORKFLOW.md) when contributing back.

## Next-specific rules (read carefully — different from Vite)

1. **Every page using the kit must start with `'use client'`** (the kit is a client-side component library).
2. **Styles**: keep `app/globals.css` exactly as-is — 4 kit imports + the 2 `@source` lines (Tailwind v4 scans the kit dist). Do NOT `@import "tailwindcss"` a second time.
3. No `transpilePackages` config needed — the package is standard ESM.
4. The dark toggle is a client component (useState + `data-bp-theme` on a wrapper, or on `<html>` via an effect).
5. New route = new folder under `app/` (`page.tsx` + `'use client'` when it uses the kit).

## General rules (same as every Wakii app)

Tokens-only colors (`bg-s1`, `text-ink2`, `border-line`, `text-accent`…) · sizes h-8/9/10 · radius lg/xl/pill · focus `ring-accent/40` · icons only from the kit's `<Icon name>` · minimum a11y.

## Checking

`pnpm build` (static prerender must be hydration-clean) + check light/dark.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
