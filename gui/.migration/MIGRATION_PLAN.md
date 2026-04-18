# Arkenar UI Migration Plan

Goal: make the existing Tauri + React + TypeScript app look like `Arkenar_Desktop_UI.html` (kept in the project root) **without breaking any functionality**.

The new HTML is a visual prototype (single file, 1179 lines, no store, no Tauri). It's a *reference*, not a drop-in replacement. We port it piece by piece.

---

## Why the previous attempt stalled

- 68 files × ~12k LOC is too large a scope for "match this mockup" in one shot
- The mockup has no business logic — AI has to infer which props/handlers/state to preserve, and gets paralyzed
- No stop condition → agent does a couple of edits, isn't sure if it's done, stops

This plan fixes both by giving each phase **a finite file list, explicit preservation rules, and a definition of done.**

---

## Phase overview

| # | Phase | Files touched | Risk | Visual impact |
|---|---|---|---|---|
| 1 | Design tokens | `src/App.css` only | Low | ~40% — colors/borders align instantly |
| 2 | Icon system | `src/components/Icon.tsx` (new) + incremental adoption | Low | Medium — thinner, more consistent icons |
| 3 | Shell: TitleBar + StatusStrip | `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/TopStats.tsx` | Medium | High — frame of the app changes |
| 4a | Studio workspace | `src/components/studio/*` (5 files) | Medium | High |
| 4b | Scanner workspace | `src/components/scanner/*` (6 files) | Medium | High |
| 4c | Recon workspace | `src/components/recon/*` (6 files) | Medium | High |
| 5 | Modals | `SettingsModal.tsx`, `ChangelogModal.tsx`, `InfoModal.tsx`, `CommandPalette.tsx` | Low | Medium |
| 6 | Polish pass | Any remaining file | Low | Small |

**Do phases in order.** Do not start phase N+1 until phase N is visually verified in the running app.

---

## The golden rules (apply to every phase)

1. **Never modify**: `src/store.ts`, `src/types.ts`, `src/lib/*`, `src/utils/*`, `src-tauri/**`, `package.json`, any `use*.ts` hook. These hold business logic.
2. **Preserve every prop, callback, i18n key, and event handler** on existing components. Only layout, className, color, spacing, and icon may change.
3. **If a feature exists in the old code but not in the mockup, KEEP IT.** The mockup is incomplete by design.
4. **Tailwind classes are fine**, but colors must come from CSS variables — no hard-coded hex values in JSX.
5. **Output format**: full replacement file contents for each changed file, in order. No "…rest unchanged" stubs.
6. **Stop condition per phase**: when the listed files compile, the app runs, and the listed "Definition of done" checks pass.

---

## Token mapping (used in every phase)

The new UI uses short names. The existing app uses Tailwind v4 `@theme` tokens. Phase 1 unifies them. From Phase 2 onward, **always use the existing token names** (`--color-bg-root`, `--color-accent`, etc.) — just with the values updated in Phase 1.

| New UI token | Value | Maps to existing |
|---|---|---|
| `--bg` | `#0b0b0d` | `--color-bg-root` |
| `--bg-2` | `#0f0f12` | *(new)* `--color-bg-root-2` |
| `--panel` | `#121215` | `--color-bg-panel` |
| `--panel-2` | `#16161b` | `--color-bg-hover` base |
| `--line` | `#1f1f24` | `--color-border-subtle` |
| `--line-2` | `#26262c` | `--color-border-hover` |
| `--text` | `#d4d4d8` | `--color-text-primary` |
| `--muted` | `#6b7280` | `--color-text-muted` |
| `--ghost` | `#4b5563` | `--color-text-ghost` |
| `--accent` | `#f97316` | `--color-accent` (was `#FF5E00`) |
| `--accent-2` | `#fb923c` | `--color-accent-hover` |
| `--ok` | `#22c55e` | `--color-status-success` |
| `--warn` | `#eab308` | `--color-status-warning` |
| `--err` | `#ef4444` | `--color-status-critical` |

**Font family note**: mockup uses system UI / `SF Mono`. Existing app uses `Space Grotesk` + `JetBrains Mono`. Keep the existing fonts — they look more premium and are already wired up. Only adopt the mockup's sizes (`12px` base, `10-11px` for chrome, mono for codes).

---

## How to run each phase in Antigravity

1. Open a **fresh agent conversation** for each phase. Don't reuse the previous phase's conversation.
2. Make sure `.migration/Arkenar_Desktop_UI.html` and the phase prompts are in your workspace (see `README.md` for setup).
3. Paste the phase prompt (contents of `.migration/PHASE_N_PROMPT.md`) as your first message. The agent reads workspace files by path — no attachments needed.
4. Review the plan the agent produces (Planning mode). Comment on it if something looks off. Approve when it matches the prompt's file list.
5. Let the agent work. Run the app locally when it finishes. Check the "Definition of done" list.
6. If something's broken, reply in the SAME conversation with the exact broken behavior. Only move to the next phase when green.
7. Commit after every phase with message `phase N: <short name>`. This gives you a fallback point.
