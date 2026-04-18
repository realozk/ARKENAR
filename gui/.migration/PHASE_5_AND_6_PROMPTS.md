# PHASE 5 — Modals

Paste in a fresh Antigravity agent conversation.

---

## Prompt

You are doing Phase 5 of a 6-phase UI migration. Phases 1–4 are done. This phase restyles the four modal dialogs.

### Read first
1. `.migration/MIGRATION_PLAN.md` — golden rules
2. `.migration/Arkenar_Desktop_UI.html` — design language reference (note: mockup has no modals, so apply established patterns)
3. The 4 files listed below

### Files you may modify
- `src/components/SettingsModal.tsx`
- `src/components/ChangelogModal.tsx`
- `src/components/InfoModal.tsx`
- `src/components/CommandPalette.tsx`

### Files you must NOT touch
- Everything else. Especially store, types, hooks.
- Do not change how modals are opened or closed — only how they look.

### Preservation Contract
Before writing code, list (per file):
- Every form field and its binding
- Every button and its handler
- Every tab or section
- Every i18n key
- Every keyboard shortcut (especially for `CommandPalette.tsx`)

Every item must be preserved.

### Visual target
The mockup does not render modals, so apply the established design language:
- Backdrop: `bg-black/60` with subtle blur (`backdrop-blur-sm`)
- Modal surface: `bg-[color:var(--color-bg-panel)]` with `border border-[color:var(--color-border-subtle)]`, rounded `rounded` (2–4px), no heavy shadows
- Header: mono 11px uppercase `tracking-[0.22em]` in `--color-accent` for the title
- Close button top-right: 24×24, muted color, hover to `--color-text-primary`
- Inputs: `bg-[color:var(--color-bg-input)]` with `border-[color:var(--color-border-subtle)]`, `focus:border-[color:var(--color-accent)]`
- Primary action buttons: `bg-[color:var(--color-accent)]` + white text, mono 11px uppercase
- Secondary: `border-[color:var(--color-border-subtle)]`, no background, `hover:bg-[color:var(--color-bg-hover)]`

### Command Palette specifics
Match the spirit of quick-launch tools: a thin search input at top with a `SearchIcon` from `icons.tsx`, results list below with icon + label + right-side shortcut hint in muted mono. Preserve all existing commands and keyboard navigation (arrow keys, Enter, Escape).

### Definition of done
- All four modals open and close correctly.
- Every form field still saves to the same place.
- Every command in the palette still fires its action.
- Visually consistent with Studio/Scanner/Recon phases.

### Output format
Preservation contract, then full contents of each modified file, then a Notes section for anything ambiguous.

---

# PHASE 6 — Polish Pass

Paste in a fresh Antigravity agent conversation.

---

## Prompt

You are doing Phase 6, the final polish pass of the UI migration. Phases 1–5 are done.

### Read first
1. `.migration/MIGRATION_PLAN.md` — golden rules
2. Walk `src/` and look for inconsistencies (see audit checklist below)

### Task
Audit the entire `src/` directory and find any remaining visual inconsistencies from the migration. Fix only cosmetic issues. No new features, no logic changes.

### Specifically look for
1. **Hard-coded colors in JSX** — any `#xxxxxx` or `rgb(...)` not coming from a CSS variable. Replace with the appropriate `var(--color-*)` token.
2. **Leftover `lucide-react` or `react-icons` imports** — replace with entries from `src/components/icons.tsx`, adding new icon definitions there if needed (same thin-stroke style, 24×24 viewBox).
3. **Font-size inconsistencies** — chrome text should be 10–11px mono uppercase, body 12px, headers from the existing sans stack.
4. **Border inconsistencies** — panel borders should all be `border-[color:var(--color-border-subtle)]`, never hard-coded greys.
5. **Button style inconsistencies** — primary actions use accent, secondary use border-only, ghost actions have no border. Flag any oddballs.
6. **Spacing jitter** — if adjacent components use wildly different padding (e.g. `p-2` vs `p-4`), flag but don't aggressively normalize unless clearly wrong.

### Files you must NOT touch
- `src/store.ts`, `src/types.ts`, `src/lib/*`, `src/utils/*`, any `use*.ts` hook, `src-tauri/**`, `package.json`.

### Preservation rule
Every prop, handler, i18n key, and render branch must remain. This is a **cosmetic pass only**.

### Definition of done
- No hex colors in JSX of any component file.
- No imports from `lucide-react` or `react-icons` in any component.
- The app feels visually unified across all three workspaces and all modals.

### Output format
1. An **audit summary** table: `file | issue | fix`
2. Full contents of every modified file
3. A "Deferred" section for anything that needs a decision from me (e.g. "This button could be primary or secondary, which do you want?")
