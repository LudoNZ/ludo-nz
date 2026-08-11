"use client"

import styles from "./button.module.scss"

export type Variant = "primary" | "secondary" | "danger"

export type Size = "small" | "medium" | "large" | "icon"

type ButtonProps = {
  children: React.ReactNode
  onClick: () => void
  type?: "button" | "submit" | "reset"
  disabled?: boolean
  variant?: Variant
  size?: Size
  className?: string
  /** required in practice for size="icon" — there's no visible text for a
   * screen reader to announce otherwise. Also shown as a native tooltip. */
  ariaLabel?: string
}

const variantClassMap: Record<Variant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  danger: styles.danger,
}

const sizeClassMap: Record<Size, string> = {
  small: styles.small,
  medium: styles.medium,
  large: styles.large,
  icon: styles.icon,
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  type = "button",
  disabled = false,
  variant = "primary",
  size = "medium",
  className = "",
  ariaLabel,
}) => {
  return (
    <button
      className={`${variantClassMap[variant]} ${sizeClassMap[size]} ${className}`}
      onClick={() => onClick()}
      type={type}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {children}
    </button>
  )
}

export default Button
