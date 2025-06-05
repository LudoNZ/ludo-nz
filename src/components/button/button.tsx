"use client"

import styles from "./button.module.scss"

export type Variant = "primary" | "secondary" | "danger"

export type Size = "small" | "medium" | "large"

type ButtonProps = {
  children: React.ReactNode
  onClick: () => void
  type?: "button" | "submit" | "reset"
  disabled?: boolean
  variant?: Variant
  size?: Size
  className?: string
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
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  type = "button",
  disabled = false,
  variant = "primary",
  size = "medium",
  className = "",
}) => {
  return (
    <button
      className={`${variantClassMap[variant]} ${sizeClassMap[size]} ${className}`}
      onClick={() => onClick()}
      type={type}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export default Button
