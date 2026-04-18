import { Icon, type IconProps } from './Icon';

/** Browser / basic scanner tab — rectangle with horizontal rules */
export function BasicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 9h18M7 14h4M7 17h7" />
    </Icon>
  );
}

/** Code / Studio tab — angle brackets and slash */
export function StudioIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 8-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" />
    </Icon>
  );
}

/** Recon / search tab — magnifying glass */
export function ReconIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

/** Chevron down */
export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** Plus / add */
export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** Search / magnifying glass */
export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

/** Play — filled triangle */
export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props} filled>
      <path d="M6 4l14 8-14 8z" />
    </Icon>
  );
}

/** Stop — filled square */
export function StopIcon(props: IconProps) {
  return (
    <Icon {...props} filled>
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </Icon>
  );
}

/** Sidebar toggle — rectangle with left column divider */
export function SidebarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M9 4v16" />
    </Icon>
  );
}

/** Info — circle with i */
export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </Icon>
  );
}

/** Settings / cog — circle with spokes */
export function CogIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

/** Minimize — horizontal line */
export function MinimizeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

/** Maximize / restore — empty square */
export function MaximizeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" />
    </Icon>
  );
}

/** Close / X */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

/** Copy to clipboard */
export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="12" height="12" rx="1" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}

/** Format / align text */
export function FormatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h10M4 18h16" />
    </Icon>
  );
}

/** Word-wrap */
export function WrapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6h18M3 12h15a3 3 0 0 1 0 6h-4M3 18h4M7 15l-4 3 4 3" />
    </Icon>
  );
}

/** Save — floppy disk */
export function SaveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8" />
    </Icon>
  );
}

/** Lightning bolt / execute — filled */
export function BoltIcon(props: IconProps) {
  return (
    <Icon {...props} filled>
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </Icon>
  );
}

/** Trash / delete */
export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4h6v3" />
    </Icon>
  );
}

/** Dot indicator — filled circle */
export function DotIcon(props: IconProps) {
  return (
    <Icon {...props} filled>
      <circle cx="12" cy="12" r="5" />
    </Icon>
  );
}

/** Send / paper airplane */
export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
    </Icon>
  );
}

/** Key / auth — solid key shape */
export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6M15.5 7.5l3 3M18 5l2 2" />
    </Icon>
  );
}

/** Arrow right — for Send to Basic */
export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </Icon>
  );
}

/** Wand / beautify — magic wand */
export function WandIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" />
    </Icon>
  );
}

/** Git compare — diff view */
export function GitCompareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7M11 18H8a2 2 0 0 1-2-2V9" />
      <path d="M9 3l3 3-3 3M15 21l3-3-3-3" />
    </Icon>
  );
}

/** Code2 — PoC export */
export function Code2Icon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 8l-5 4 5 4M15 8l5 4-5 4M13 4l-2 16" />
    </Icon>
  );
}

/** Arrow left-right — mirror to request */
export function ArrowLeftRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3l-5 5 5 5M16 21l5-5-5-5M3 8h18M3 16h18" />
    </Icon>
  );
}

/** Rotate CCW — reload / retry */
export function RotateCcwIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

/** Clipboard paste — import cURL */
export function ClipboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h4" />
    </Icon>
  );
}

/** Check circle — success state */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </Icon>
  );
}

/** Refresh / spin — loading spinner */
export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </Icon>
  );
}

/** Download — arrow pointing into a tray */
export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </Icon>
  );
}

/** Chevron up */
export function ChevronUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m18 15-6-6-6 6" />
    </Icon>
  );
}

/** Chevron down */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** External link — box with arrow */
export function ExternalLinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14L21 3" />
    </Icon>
  );
}

/** Clock — circle with clock hands */
export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Icon>
  );
}

/** Arrow down to line — auto-scroll */
export function ArrowDownLineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 17V3M5 10l7 7 7-7M19 21H5" />
    </Icon>
  );
}

/** Arrow up to line — scroll to top */
export function ArrowUpLineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 7v14M5 14l7-7 7 7M19 3H5" />
    </Icon>
  );
}

/** Check mark — single tick */
export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Icon>
  );
}

/** CPU / processor chip */
export function CpuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </Icon>
  );
}

/** Bell / notification */
export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
    </Icon>
  );
}

/** Layout template — two-column panel */
export function LayoutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M9 21V9" />
    </Icon>
  );
}

/** Radar / sonar ring */
export function RadarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
      <path d="M4 6a10 10 0 1 0 16 8" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 12L19 5" />
    </Icon>
  );
}

/** Link / chain */
export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Icon>
  );
}

/** Volume / speaker */
export function VolumeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </Icon>
  );
}

/** Zoom in / magnify */
export function ZoomInIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35M11 8v6M8 11h6" />
    </Icon>
  );
}

/** Sparkles / stars */
export function SparklesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3l1.88 5.12L19 10l-5.12 1.88L12 17l-1.88-5.12L5 10l5.12-1.88z" />
      <path d="M5 3l.88 2.12L8 6l-2.12.88L5 9l-.88-2.12L2 6l2.12-.88z" />
      <path d="M19 15l.88 2.12L22 18l-2.12.88L19 21l-.88-2.12L16 18l2.12-.88z" />
    </Icon>
  );
}

/** Shield / security */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Icon>
  );
}

/** Users / team */
export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  );
}

/** Terminal / console */
export function TerminalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </Icon>
  );
}

/** Palette / color swatch */
export function PaletteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </Icon>
  );
}

/** Keyboard shortcut indicator */
export function KeyboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8M6 10h.01" />
    </Icon>
  );
}

/** History — clock with arrow */
export function HistoryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </Icon>
  );
}

/** Panel left close / sidebar toggle */
export function PanelLeftCloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M9 3v18M14 9l-3 3 3 3" />
    </Icon>
  );
}

/** Scan search — maginfying glass with lines */
export function ScanSearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <circle cx="12" cy="12" r="3" />
      <path d="m16 16-1.9-1.9" />
    </Icon>
  );
}

/** Settings / sliders */
export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </Icon>
  );
}
