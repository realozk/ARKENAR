# PHASE 2 — Icon System

Paste this as your **first message** in a fresh Antigravity agent conversation.

---

## Prompt

You are doing Phase 2 of a 6-phase UI migration. Phase 1 (CSS tokens) is already done. This phase creates a shared thin-stroke icon component and does a **single mechanical find-and-replace pass** across the codebase.

### Read first
1. `.migration/MIGRATION_PLAN.md` — golden rules
2. `.migration/Arkenar_Desktop_UI.html` lines ~70–96 — the icon definitions you'll be porting
3. The 4 files listed below under "Files you may modify"

### Files you may modify / create
- **Create**: `src/components/Icon.tsx` (new file)
- **Create**: `src/components/icons.tsx` (new file — a catalog of named icons)
- **Modify**: any `.tsx` file that currently imports icons from `lucide-react`, `react-icons`, or inlines its own `<svg>` — but **only to swap the icon**, not to change surrounding markup.

### Files you must NOT touch
- `src/store.ts`, `src/types.ts`, `src/lib/*`, `src/utils/*`, `src-tauri/**`, `package.json`, any `use*.ts` hook, `src/App.css`.
- Do not add or remove props, handlers, state, or i18n keys on any component.

### Exact task

1. Create `src/components/Icon.tsx` containing a base `<Icon>` primitive matching the new UI's `<I>` helper:

   ```tsx
   import React from 'react';

   export type IconProps = {
     size?: number;        // default 13
     strokeWidth?: number; // default 1.5
     filled?: boolean;     // if true, fill="currentColor" strokeWidth=0
     className?: string;
     children?: React.ReactNode;
   };

   export function Icon({ size = 13, strokeWidth = 1.5, filled = false, className, children }: IconProps) {
     return (
       <svg
         width={size} height={size} viewBox="0 0 24 24"
         fill={filled ? 'currentColor' : 'none'}
         stroke="currentColor"
         strokeWidth={filled ? 0 : strokeWidth}
         strokeLinecap="round" strokeLinejoin="round"
         className={className}
         aria-hidden="true"
       >
         {children}
       </svg>
     );
   }
   ```

2. Create `src/components/icons.tsx` exporting named icons. Copy the definitions from `.migration/Arkenar_Desktop_UI.html` lines ~76–96 (the `IBasic`, `IStudio`, `IRecon`, `IChev`, `IPlus`, `ISearch`, `IPlay`, `IStop`, `ISidebar`, `IInfo`, `ICog`, `IMin`, `ISquare`, `IX`, `ICopy`, `IFmt`, `IWrap`, `ISave`, `IBolt`, `ITrash`, `IDot` set) but:
   - Export them with clear names: `BasicIcon`, `StudioIcon`, `ReconIcon`, `ChevronIcon`, `PlusIcon`, `SearchIcon`, `PlayIcon`, `StopIcon`, `SidebarIcon`, `InfoIcon`, `CogIcon`, `MinimizeIcon`, `MaximizeIcon`, `CloseIcon`, `CopyIcon`, `FormatIcon`, `WrapIcon`, `SaveIcon`, `BoltIcon`, `TrashIcon`, `DotIcon`.
   - Each one wraps `<Icon>` and passes its paths as children.
   - Keep the same visual paths — this is a faithful port of the mockup's icons.

3. **Do a partial adoption pass** — only replace icons in these 4 files this phase:
   - `src/App.tsx`
   - `src/components/Sidebar.tsx`
   - `src/components/TopStats.tsx`
   - `src/components/primitives.tsx`

   For each lucide-react / react-icons import in those files, find the closest match in the new set and swap it. If there is no match, **leave the existing icon alone** and note it at the end of your response.

4. Do not touch icons in `studio/`, `scanner/`, `recon/`, or modals this phase — those phases will do their own swap.

### Definition of done
- App builds and runs.
- The 4 listed files use the new `Icon` primitive; all other files unchanged.
- No visual regression in functionality (buttons still click, panels still open).
- Icons in the shell are visibly thinner (1.5 stroke vs lucide's default 2).

### Output format
For each changed/new file, output:

````
--- src/components/Icon.tsx ---
<full contents>

--- src/components/icons.tsx ---
<full contents>

--- src/App.tsx ---
<full contents>

… etc
````

Then a section titled **"Icons not mapped"** listing any lucide icon in the 4 files for which you couldn't find a good equivalent, so I can decide what to do.
