import type { ReactElement } from "react";
import type { Shape } from "./annotated-photo";

// Icônes SVG (style Heroicons, au trait, currentColor) partagées par le
// header d'édition et la palette d'insertion.
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };

export const SunIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} {...base} aria-hidden="true">
    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);
export const MoonIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} {...base} aria-hidden="true">
    <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);
export const PhotoIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...base} aria-hidden="true">
    <path d="M3 9a2 2 0 012-2h.74a2 2 0 001.534-.79l.492-.652a2 2 0 011.534-.79h5.4a2 2 0 011.534.79l.492.652A2 2 0 0018 7h1a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <circle cx="12" cy="13.5" r="3.2" />
  </svg>
);
export const ArrowIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...base} aria-hidden="true">
    <path d="M5 19L19 5M19 5v8M19 5h-8" />
  </svg>
);
export const RectIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...base} aria-hidden="true">
    <rect x="4.5" y="6.5" width="15" height="11" rx="1.5" />
  </svg>
);
export const TextIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...base} aria-hidden="true">
    <path d="M5 6h14M12 6v13M9 19h6" />
  </svg>
);
export const PlusIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...base} aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const PublishIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...base} aria-hidden="true">
    <path d="M5 13l4 4L19 7" />
  </svg>
);
export const CollapseIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...base} aria-hidden="true">
    <path d="M4 9l8-4 8 4-8 4-8-4zM4 15l8 4 8-4" />
  </svg>
);
export const ExpandIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} {...base} aria-hidden="true">
    <path d="M4 9l8-4 8 4-8 4-8-4z" />
  </svg>
);

export const SHAPE_ICONS: Record<string, (p: { size?: number }) => ReactElement> = {
  arrow: ArrowIcon,
  rect: RectIcon,
  text: TextIcon,
};

export type ToolKind = Shape["type"];
