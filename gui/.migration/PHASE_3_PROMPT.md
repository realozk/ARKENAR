# PHASE 3 — App Shell (TitleBar, StatusStrip, Sidebar, TopStats)

Paste this as your **first message** in a fresh Antigravity agent conversation.

---

## Prompt

You are doing Phase 3 of a 6-phase UI migration. Phases 1 (tokens) and 2 (icons) are done. This phase ports the outer frame of the app — titlebar, status strip, sidebar, top-stats — to match the mockup.

### Read first
1. `.migration/MIGRATION_PLAN.md` — golden rules
2. `.migration/Arkenar_Desktop_UI.html` — specifically the `TitleBar` function (lines ~102–164) and `StatusStrip` function (lines ~169–193)
3. All files listed under "Files you may modify"

### Files you may modify
- `src/App.tsx`
- `src/components/Sidebar.tsx`
- `src/components/TopStats.tsx`

### Files you may create
- `src/components/TitleBar.tsx` (new — extracted from mockup)
- `src/components/StatusStrip.tsx` (new — extracted from mockup)

### Files you must NOT touch
- `src/store.ts`, `src/types.ts`, any `use*.ts` hook, anything in `src/components/studio/`, `src/components/scanner/`, `src/components/recon/`, any modal, `src/App.css`, `src-tauri/**`, `package.json`.
- Do not change the routing between Studio / Scanner / Recon panels — only how the frame around them looks.

### Preservation rules (READ CAREFULLY)

Before you write anything, open `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/TopStats.tsx` and **list every**:
- prop
- event handler
- store selector / action
- i18n key (`t("…")`)
- conditional render branch

Write that list at the top of your response as a **Preservation Contract**. Every item must appear in the rewritten components. If any item has no obvious home in the new layout, say so and stop — do not silently drop features.

### Visual target

Reference `.migration/Arkenar_Desktop_UI.html`:
- `TitleBar` function, lines ~102–164 — this is the target for the top row. Height `h-11` (44px), traffic lights on the left, wordmark, centered segmented tab control (BASIC / STUDIO / RECON), right-side running indicator + "EXECUTE ENGINE" button + window controls.
- `StatusStrip` function, lines ~169–193 — this is the thin ribbon below the titlebar. Height `h-6` (24px), mono text, left side has DRAFT/UNSAVED/UNSENT/MUTATED/STATUS/TIME/REQ/RPS, right side has scope/proxy/Clear Findings.
- The sidebar: keep your existing Sidebar navigation items and behavior. Restyle to match mockup's dark panels (`--color-bg-panel`), `1px` borders in `--color-border-subtle`, section headers in mono 10–11px uppercase with `tracking-[0.14em]`, hover background `--color-bg-hover`, active item uses accent color.

### Specific adaptations

1. **TitleBar**: Wire the 3 tabs to whatever state currently controls the BASIC/STUDIO/RECON switch in `src/App.tsx`. Keep that state owner — just style the new tab bar.
2. **Traffic lights**: If the existing app doesn't show macOS-style lights, conditionally render them only on macOS (use `navigator.platform.includes('Mac')` or an existing OS check if the codebase has one). On Windows/Linux, show the existing minimize/maximize/close buttons on the right only.
3. **EXECUTE ENGINE button**: If the current app has a global "run" action, wire this button to it. If not, leave it wired to a no-op for now and flag it at the end.
4. **StatusStrip**: Only render it when the Studio tab is active, matching the mockup's usage.
5. **Sidebar width**: Match the mockup's density — ~56px collapsed icons-only rail, or ~220px expanded if your app supports both, whichever the existing `Sidebar.tsx` already does. Do not introduce a new collapse/expand feature if it doesn't exist.
6. **Fonts**: Use the existing `--font-sans` and `--font-mono` tokens, not the mockup's system stack. Match the mockup's **sizes** (12px base, 10–11px for chrome) by using Tailwind arbitrary values: `text-[11px]`, `tracking-[0.18em]`, etc.

### Styling rules
- All colors via `var(--color-*)` CSS variables or Tailwind arbitrary `text-[color:var(--color-foo)]`. No raw hex in JSX.
- Use `.mono` class (already in App.css? if not, use `font-mono`) for all chrome text.
- Border style: `border border-[color:var(--color-border-subtle)]`.
- Keep any accessibility attributes (`aria-label`, `role`, `tabIndex`) that exist today.

### Definition of done
- App builds and runs.
- Titlebar visually matches the mockup (segmented tabs centered, orange accent on active).
- Status strip shows under the titlebar when Studio is active.
- Sidebar looks darker, denser, with thin borders — but every navigation item still works.
- Switching between BASIC / STUDIO / RECON still routes to the correct panels.
- Every item in your Preservation Contract still works.

### Output format
1. First: the Preservation Contract (bullet list).
2. Then: full contents of every file you created or changed, each in its own labeled code block.
3. Finally: a "Notes" section listing anything you had to stub (like the EXECUTE ENGINE button if no global handler exists) and any icon you couldn't map.
