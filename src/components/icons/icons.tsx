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

export const WandIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M4 16 13.5 6.5" />
    <path d="M11.5 4.5 15.5 8.5" />
    <path d="M15.5 3v2.4M15.5 3l1.2 1.2M15.5 3l-1.2 1.2" />
    <path d="M4.5 5v1.6M4.5 5l.9.9M4.5 5l-.9.9" />
  </svg>
)

export const TopIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M10 16V4.5" />
    <path d="M5 9.5 10 4.5l5 5" />
  </svg>
)

export const SlidersIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M3 6h14M3 14h14" />
    <circle cx="7" cy="6" r="1.8" fill="var(--background, #fff)" />
    <circle cx="13" cy="14" r="1.8" fill="var(--background, #fff)" />
  </svg>
)

/** a post standing in its hole */
export const PostHoleIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M8.5 2.5v11M11.5 2.5v11" />
    <path d="M5.5 8.5v6.2a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8.5" />
    <path d="M2.5 8.5h3M14.5 8.5h3" />
  </svg>
)

/** a wall seen from above, turning a corner */
export const PlanViewIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M3.5 15.5h9v-10" />
    <circle cx="3.5" cy="15.5" r="1.3" />
    <circle cx="12.5" cy="15.5" r="1.3" />
    <circle cx="12.5" cy="5.5" r="1.3" />
  </svg>
)

/** a wall in 3D: a box seen from above and to one side */
export const Render3DIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M2.5 8.5 7 5.5h10.5L13 8.5Z" />
    <path d="M2.5 8.5v7H13v-7M13 15.5l4.5-3v-7" />
  </svg>
)

/** a wall from the front: posts and board courses */
export const ElevationIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M3 5h14M3 9h14M3 13h14" />
    <path d="M5.5 3.5v13M14.5 3.5v13" />
  </svg>
)

/** a stack of boxes, for the materials */
export const MaterialsIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M10 2.8 16.5 6v8L10 17.2 3.5 14V6Z" />
    <path d="M3.5 6 10 9.2 16.5 6M10 9.2v8" />
  </svg>
)

export const OrderIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M7 3.5h6a1 1 0 0 1 1 1V5H6v-.5a1 1 0 0 1 1-1Z" />
    <path d="M6 4.5H5a1 1 0 0 0-1 1V16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-1" />
    <path d="M7 9.5h6M7 12.5h4" />
  </svg>
)

export const ChevronRightIcon: React.FC<IconProps> = ({ className }) => (
  <svg {...base} className={className}>
    <path d="M7.5 4.5 13 10l-5.5 5.5" />
  </svg>
)
