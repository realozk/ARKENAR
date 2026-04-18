# PHASE 1 — Design Tokens

Paste this as your **first message** in a fresh Antigravity agent conversation. The files referenced below are already in the workspace — you don't attach anything.

---

## Prompt

You are doing Phase 1 of a 6-phase UI migration. This phase ONLY updates CSS variables — no component changes, no layout changes, no logic changes.

### Read first (in this order)
1. `.migration/MIGRATION_PLAN.md` — the overall migration plan and golden rules
2. `.migration/Arkenar_Desktop_UI.html` lines 10–62 — target `:root` token values
3. `src/App.css` — the file you will be editing (look at the `@theme` block)

### Files you may modify
- `src/App.css` — **the only file you touch this phase**

### Files you must NOT touch
- Anything outside `src/App.css`
- Especially not `src/store.ts`, `src/types.ts`, any `.tsx` file, any `use*.ts` hook, or `src-tauri/**`

### Exact task

1. Update the values of the existing `@theme` tokens in `src/App.css` to match the new UI's palette:

   | Existing token | New value |
   |---|---|
   | `--color-bg-root` | `#0b0b0d` |
   | `--color-bg-panel` | `#121215` |
   | `--color-bg-card` | `rgba(255,255,255,0.025)` |
   | `--color-bg-input` | `#0f0f12` |
   | `--color-bg-hover` | `#16161b` |
   | `--color-bg-terminal` | `#0b0b0d` |
   | `--color-border-subtle` | `#1f1f24` |
   | `--color-border-hover` | `#26262c` |
   | `--color-border-focus` | `rgba(249,115,22,0.4)` |
   | `--color-text-primary` | `#d4d4d8` |
   | `--color-text-secondary` | `#a1a1aa` |
   | `--color-text-muted` | `#6b7280` |
   | `--color-text-ghost` | `#4b5563` |
   | `--color-accent` | `#f97316` |
   | `--color-accent-dim` | `rgba(249,115,22,0.10)` |
   | `--color-accent-hover` | `#fb923c` |
   | `--color-accent-text` | `#f97316` |
   | `--color-status-critical` | `#ef4444` |
   | `--color-status-warning` | `#eab308` |
   | `--color-status-success` | `#22c55e` |
   | `--color-status-info` | `#f97316` |

2. Add **two new** tokens inside the same `@theme` block (the new UI needs them):
   - `--color-bg-root-2: #0f0f12;` (for titlebar / status strip backgrounds)
   - `--color-accent-weak: #7c2d12;` (for pressed/weak accent states)

3. Update `::selection` and `::-moz-selection` backgrounds from `rgba(255,94,0,0.35)` to `rgba(249,115,22,0.35)`.

4. Update `--shadow-accent-glow` and `--shadow-accent-btn` to use `249,115,22` instead of `255,94,0`.

5. **Do NOT** change font stacks, font sizes, scrollbar styles, `#root` border-radius, or any selector/rule outside `@theme` and the selection/shadow lines above.

### Definition of done
- `src/App.css` is the only file changed.
- `npm run dev` (or `tauri dev`) boots without errors.
- The app visibly shifts toward slightly warmer orange (#f97316 vs old #FF5E00) and slightly deeper blacks.
- No component is visually broken — just recolored.

### Output format
Return the **complete new contents of `src/App.css`** in one code block. No diff format, no "…unchanged" stubs. Then list the 21 token values you changed as a checklist so I can verify.

If any of the mapping above is ambiguous for a specific rule you encounter, **keep the existing value and flag it at the end** — do not guess.
