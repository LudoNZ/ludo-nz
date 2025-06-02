import Button from "@/components/button/button"
import { HTMLAttributes, ReactNode } from "react"
import styles from "./theme.module.scss"

type PixelValue = `${number}px`
type HexValue = `#${string}`

type ColourSampleProps = {
  colour: HexValue
  label: string
} & HTMLAttributes<HTMLDivElement>

const ColourSample = ({
  colour,
  label,
  ...htmlProps
}: ColourSampleProps): ReactNode => (
  <div
    style={{ width: "100px", height: "40px", backgroundColor: colour }}
    {...htmlProps}
  >
    <p>{`${label}: ${colour}`}</p>
  </div>
)

export class Theme {
  name: string
  background: HexValue
  foreground: HexValue
  colorPrimary: HexValue
  colorSecondary: HexValue
  colorDanger: HexValue
  borderRadius: PixelValue

  public constructor(
    name: string,
    background: HexValue,
    foreground: HexValue,
    colorPrimary: HexValue,
    colorSecondary: HexValue,
    colorDanger: HexValue,
    borderRadius: PixelValue
  ) {
    this.name = name
    this.background = background
    this.foreground = foreground
    this.colorPrimary = colorPrimary
    this.colorSecondary = colorSecondary
    this.colorDanger = colorDanger
    this.borderRadius = borderRadius
  }
}

export function setTheme(theme: Theme) {
  const setProperties: { CssPropertyName: string; value: HexValue }[] = [
    { CssPropertyName: "--color-primary", value: theme.colorPrimary },
    { CssPropertyName: "--color-secondary", value: theme.colorSecondary },
    { CssPropertyName: "--color-danger", value: theme.colorDanger },
    { CssPropertyName: "--background", value: theme.background },
    { CssPropertyName: "--foreground", value: theme.foreground },
  ]

  setProperties.forEach((element) => {
    document.documentElement.style.setProperty(
      element.CssPropertyName,
      element.value
    )
  })
}

export const RenderThemePallete: React.FC<{ theme: Theme }> = ({ theme }) => {
  return (
    <div
      className={styles.themeSample}
      style={{
        backgroundColor: theme.background,
        color: theme.foreground,
        outline: `2px solid ${theme.colorSecondary}`,
      }}
    >
      <h4>{theme.name}</h4>
      <ColourSample colour={theme.colorPrimary} label="primary" />
      <ColourSample colour={theme.colorSecondary} label="secondary" />
      <ColourSample colour={theme.colorDanger} label="danger" />
      <ColourSample colour={theme.background} label="background" />
      <ColourSample
        colour={theme.foreground}
        label="foreground"
        style={{
          width: "100px",
          height: "40px",
          backgroundColor: theme.foreground,
          color: theme.background,
        }}
      />
      <Button
        onClick={() => {
          setTheme(theme)
        }}
      >
        Select Theme
      </Button>
    </div>
  )
}
