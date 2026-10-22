import type { SVGProps } from 'react';

/**
 * Small stroke icons (24×24 grid, currentColor). Inline SVG, so no icon
 * dependency. Decorative by default: give the surrounding control a label.
 */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className="size-5 shrink-0"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const IconDashboard = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Icon>
);

export const IconFolder = (p: P) => (
  <Icon {...p}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
  </Icon>
);

export const IconMap = (p: P) => (
  <Icon {...p}>
    <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z" />
    <path d="M9 4v14M15 6v14" />
  </Icon>
);

export const IconCamera = (p: P) => (
  <Icon {...p}>
    <path d="M3 8.5 15.5 5l2 6.5L5 15z" />
    <path d="m17 9 3.5-1v6L18 13.5" />
    <path d="M7.5 14.5 8 20h-3" />
  </Icon>
);

export const IconReport = (p: P) => (
  <Icon {...p}>
    <path d="M7 3h7l5 5v11.5A1.5 1.5 0 0 1 17.5 21h-10A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3" />
    <path d="M14 3v5h5M9.5 13h5M9.5 17h5" />
  </Icon>
);

export const IconSettings = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1" />
  </Icon>
);

export const IconSearch = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const IconBell = (p: P) => (
  <Icon {...p}>
    <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
    <path d="M10 20a2.2 2.2 0 0 0 4 0" />
  </Icon>
);

export const IconLogout = (p: P) => (
  <Icon {...p}>
    <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
    <path d="m10 16 4-4-4-4M14 12H4" />
  </Icon>
);

export const IconKey = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2" />
  </Icon>
);

export const IconUsers = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
  </Icon>
);

/** A person (username field). */
export const IconUser = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

/** A padlock (password field). */
export const IconLock = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);

/** Show password. */
export const IconEye = (p: P) => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

/** Hide password. */
export const IconEyeOff = (p: P) => (
  <Icon {...p}>
    <path d="M10.7 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
  </Icon>
);

/** A warning triangle (errors). */
export const IconAlert = (p: P) => (
  <Icon {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);

/** A cable with its plug (cable length). */
export const IconCable = (p: P) => (
  <Icon {...p}>
    <path d="M8 3v4M16 3v4M6 7h12v3a6 6 0 0 1-12 0z" />
    <path d="M12 16v2a3 3 0 0 0 3 3h3" />
  </Icon>
);

/** A picture (field photos). */
export const IconImage = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </Icon>
);

export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconGrid = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Icon>
);

export const IconList = (p: P) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r=".75" fill="currentColor" />
    <circle cx="4.5" cy="12" r=".75" fill="currentColor" />
    <circle cx="4.5" cy="18" r=".75" fill="currentColor" />
  </Icon>
);

export const IconPin = (p: P) => (
  <Icon {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11" />
    <circle cx="12" cy="10" r="2.5" />
  </Icon>
);

export const IconClock = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const IconBuilding = (p: P) => (
  <Icon {...p}>
    <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21M15 10h3.5a1.5 1.5 0 0 1 1.5 1.5V21M3 21h18" />
    <path d="M8 8h3M8 12h3M8 16h3" />
  </Icon>
);

export const IconArrowRight = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const IconChevronDown = (p: P) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

/** Brand mark: a dome camera inside a rounded square. */
/** `onBrand`: on the indigo header band (translucent white tile). */
export const LogoMark = ({ onBrand }: { onBrand?: boolean } = {}) => (
  <span
    aria-hidden
    className={
      onBrand
        ? 'grid size-9 shrink-0 place-items-center rounded-xl bg-white/20 text-white ring-1 ring-white/25'
        : 'grid size-9 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500/40'
    }
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="size-5"
      focusable="false"
    >
      <path d="M4 9h16" />
      <path d="M6 9a6 6 0 0 0 12 0" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  </span>
);
