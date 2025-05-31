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

  private setTheme() {
    const setProperties: { CssPropertyName: string; value: HexValue }[] = [
      { CssPropertyName: "--color-primary", value: this.colorPrimary },
      { CssPropertyName: "--color-secondary", value: this.colorSecondary },
      { CssPropertyName: "--color-danger", value: this.colorDanger },
      { CssPropertyName: "--background", value: this.background },
      { CssPropertyName: "--foreground", value: this.foreground },
    ]

    setProperties.forEach((element) => {
      document.documentElement.style.setProperty(
        element.CssPropertyName,
        element.value
      )
    })
  }

  public render(): ReactNode {
    return (
      <div
        className={styles.themeSample}
        style={{
          backgroundColor: this.background,
          color: this.foreground,
          outline: `2px solid ${this.colorSecondary}`,
        }}
      >
        <h4>{this.name}</h4>
        <ColourSample colour={this.colorPrimary} label="primary" />
        <ColourSample colour={this.colorSecondary} label="secondary" />
        <ColourSample colour={this.colorDanger} label="danger" />
        <ColourSample colour={this.background} label="background" />
        <ColourSample
          colour={this.foreground}
          label="foreground"
          style={{
            width: "100px",
            height: "40px",
            backgroundColor: this.foreground,
            color: this.background,
          }}
        />
        <Button
          onClick={() => {
            this.setTheme()
          }}
        >
          Select Theme
        </Button>
      </div>
    )
  }
}
