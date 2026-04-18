# PHASE 4 — Workspaces (Studio, Scanner, Recon)

**Do these THREE sub-phases separately, in three separate Antigravity agent conversations**, in this order: Studio → Scanner → Recon. Each takes one paste of the prompt below, with the `{{WORKSPACE}}`, `{{FILES}}`, and `{{MOCKUP_REFERENCE}}` placeholders filled in.

Each sub-phase is self-contained. If Studio breaks something, fix it before starting Scanner.

---

## PHASE 4A — STUDIO

Fill in the prompt below with:

- `{{WORKSPACE}}` = `Studio`
- `{{FILES}}` =
  - `src/components/studio/StudioTopBar.tsx`
  - `src/components/studio/StudioRequestEditor.tsx`
  - `src/components/studio/StudioResponseViewer.tsx`
  - `src/components/studio/StudioHistorySidebar.tsx`
  - `src/components/studio/StudioWorkspace.tsx`
- `{{MOCKUP_REFERENCE}}` = "In `.migration/Arkenar_Desktop_UI.html`, see lines ~195 onwards — the ActionBar (METHODS constants, URL bar, Send button, mutate meta), the 3-column editor (params/headers/body tabs with the token-highlighted `pre-code` rendering), and the right-side response panel with status pill + headers + body."

---

## PHASE 4B — SCANNER

- `{{WORKSPACE}}` = `Scanner`
- `{{FILES}}` =
  - `src/components/scanner/ScannerTopBar.tsx`
  - `src/components/scanner/ScannerConfig.tsx`
  - `src/components/scanner/ScannerFindings.tsx`
  - `src/components/scanner/ScannerTerminal.tsx`
  - `src/components/scanner/ScannerWorkspace.tsx`
- `{{MOCKUP_REFERENCE}}` = "The mockup doesn't have a dedicated Scanner screen. Apply the same design language: dark `--color-bg-panel` surfaces, `--color-border-subtle` borders, mono 10–11px uppercase section headers with `tracking-[0.14em]`, orange accent for active/primary actions, status pills using `--color-status-*` tokens. Match the *feel* of the Studio screen."

---

## PHASE 4C — RECON

- `{{WORKSPACE}}` = `Recon`
- `{{FILES}}` =
  - `src/components/recon/ReconTopBar.tsx`
  - `src/components/recon/ReconLeftRail.tsx`
  - `src/components/recon/ReconHostBoard.tsx`
  - `src/components/recon/ReconHostDetail.tsx`
  - `src/components/recon/ReconWorkspace.tsx`
- `{{MOCKUP_REFERENCE}}` = "Same as Scanner — the mockup doesn't have a Recon screen. Apply the same dark surfaces, thin borders, mono uppercase labels, orange accent language."

---

## The prompt template (fill in and paste)

You are doing Phase 4-{{WORKSPACE}} of a 6-phase UI migration. Phases 1–3 are done: CSS tokens are warmer orange, icons are the new thin set, and the app shell (titlebar, status strip, sidebar) matches the mockup. Now we port the {{WORKSPACE}} workspace.

### Read first
1. `.migration/MIGRATION_PLAN.md` — golden rules
2. `.migration/Arkenar_Desktop_UI.html` — design language reference
3. Every file in `{{FILES}}` below

### Files you may modify
{{FILES}}

### Files you must NOT touch
- `src/store.ts`, `src/types.ts`, any `use*.ts` hook (especially the one inside this workspace folder — that owns all the state), anything outside the file list above, `src/App.css`, `src-tauri/**`, `package.json`.

### Preservation Contract (DO THIS FIRST)

Before writing code, open the listed files and produce a bullet-list contract covering, for EACH file:
- Every prop the component accepts
- Every store selector and action it calls
- Every i18n key (`t("…")`) it uses
- Every conditional render branch
- Every keyboard shortcut or `useEffect` side effect

Every item in this list MUST be preserved in your rewrite. If any item has no clear home in the new layout, stop and flag it — do NOT silently drop it.

### Visual target
{{MOCKUP_REFERENCE}}

### Styling rules (same every phase)
- Colors only via `var(--color-*)` tokens or Tailwind arbitrary `text-[color:var(--color-foo)]`.
- Mono chrome text via the existing mono font class; 10–11px for labels, 12px for body, `tracking-[0.14em]` – `tracking-[0.22em]` for uppercase labels.
- Borders: `border border-[color:var(--color-border-subtle)]`.
- Panels: `bg-[color:var(--color-bg-panel)]`.
- Accent usage: primary action buttons get `bg-[color:var(--color-accent)]` + white text. Active tabs get `bg-[rgba(249,115,22,0.12)]` + `text-[color:var(--color-accent-hover)]`.
- Use the icons from `src/components/icons.tsx` (created in Phase 2). If you need an icon not in that set, add it there in the same style (thin stroke, 24×24 viewBox, round caps).
- Replace any remaining `lucide-react` or `react-icons` imports in your file list.

### Definition of done
- App builds and runs.
- The {{WORKSPACE}} workspace is visually aligned with the mockup's design language.
- Every item in your Preservation Contract still works exactly as before.
- No component outside the file list has been modified.
- No changes to store, types, hooks, or business logic.

### Output format
1. The Preservation Contract (per-file bullet list).
2. Full contents of every modified file, each in its own labeled code block.
3. "Notes" section listing:
   - Any icon added to `icons.tsx`
   - Any feature flagged as ambiguous
   - Any place where the mockup's design was adapted (for Scanner/Recon which aren't in the mockup)
