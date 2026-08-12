// Minimal stroke-based icon set (feather-style: 20x20, currentColor,
// round caps/joins) for compact icon buttons — add to this file rather
// than pulling in an icon library for one-off SVGs.

type IconProps = { className?: string }

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
}

export const EditIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M12.9 3.3a1.6 1.6 0 0 1 2.3 0l1.5 1.5a1.6 1.6 0 0 1 0 2.3L7.3 16.5l-4 1 1-4Z" />
    <path d="M11.4 4.8 15.2 8.6" />
  </svg>
)

export const CloseIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M5 5 15 15" />
    <path d="M15 5 5 15" />
  </svg>
)

export const ShuffleIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M2.5 6h2.7c1.3 0 2.5.7 3.2 1.8l3.2 4.9c.7 1.1 1.9 1.8 3.2 1.8h2.2" />
    <path d="M14.5 4.5 17.5 6.5 14.5 8.5" />
    <path d="M2.5 14h2.7c1.3 0 2.5-.7 3.2-1.8l.4-.6" />
    <path d="M14.5 12.5 17.5 14.5 14.5 16.5" />
    <path d="M12 6.5c.3-.5.6-.9 1-1.2" />
  </svg>
)

export const TrashIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M4 6h12" />
    <path d="M7.5 6V4.5c0-.6.4-1 1-1h3c.6 0 1 .4 1 1V6" />
    <path d="M5.5 6 6.2 16c0 .6.5 1 1 1h5.6c.5 0 1-.4 1-1L14.5 6" />
    <path d="M8.5 9v5" />
    <path d="M11.5 9v5" />
  </svg>
)

export const SaveIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M4 3.5h9.5L16.5 6.5V16a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
    <path d="M6 3.5V8h6.5V3.5" />
    <path d="M6.5 11h5v5.5h-5z" />
  </svg>
)

export const OpenIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M3 6.5a1 1 0 0 1 1-1h3.4l1.5 1.7H16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
  </svg>
)

export const SettingsIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 3v2M10 15v2M17 10h-2M5 10H3M14.8 5.2l-1.4 1.4M6.6 13.4l-1.4 1.4M14.8 14.8l-1.4-1.4M6.6 6.6 5.2 5.2" />
  </svg>
)
