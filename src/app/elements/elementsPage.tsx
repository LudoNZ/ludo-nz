"use client"

import Button, { Size, Variant } from "@/components/button/button"
import styles from "./elementsPage.module.scss"
import { useState } from "react"
import { Theme } from "./Theme/Theme"
import { ThemeDemo } from "./Theme/themeDemo"

const ThemeColours = () => {
  const defaultTheme = new Theme(
    "default",
    "#ffffff",
    "#171717",
    "#1bb12f",
    "#b1ae1b",
    "#b11b1b",
    "8px"
  )
  const pupleHaze = new Theme(
    "Puple Haze",
    "#260d25",
    "#e7e4e7",
    "#c00cb7",
    "#422441",
    "#f50a0a",
    "5px"
  )

  const shadUi = new Theme(
    "Night Dunes",
    "#181818",
    "#fefefe",
    "#e66d50",
    "#944c3a",
    "#7f1c1c",
    "5px"
  )

  const gingerMode = new Theme(
    "Ginger MGaw",
    "#f2c18f",
    "#faf6f2",
    "#ed8e2f",
    "#5e3207",
    "#bd1102",
    "5px"
  )

  const themes: Theme[] = [defaultTheme, pupleHaze, shadUi, gingerMode]

  return (
    <div className={styles.themeColours}>
      <h3>Theme Colours</h3>

      <div className={styles.primaryColourPickerSample}>
        <label htmlFor="primary-colour-picker">Set primary-color:</label>
        <input
          id="primary-colour-picker"
          type="color"
          onChange={(e) =>
            document.documentElement.style.setProperty(
              "--color-primary",
              e.target.value
            )
          }
        />
      </div>
      <div className={styles.secondaryColourPickerSample}>
        <label htmlFor="secondary-colour-picker">Set secondary-color:</label>
        <input
          id="secondary-colour-picker"
          type="color"
          onChange={(e) =>
            document.documentElement.style.setProperty(
              "--color-secondary",
              e.target.value
            )
          }
        />
      </div>
      <h3>saved Themes</h3>
      <div className="flex">
        {themes.map((theme, index) => (
          <div key={index}>{theme.render()}</div>
        ))}
      </div>
      <ThemeDemo theme={themes[1]} />
    </div>
  )
}
const Buttons = () => {
  const [showcaseSize, setShowcaseSize] = useState<Size>("medium")
  const [showcaseVariant, setShowcaseVariant] = useState<Variant>("primary")

  const VariantSetter = () => {
    const nextVariant: Record<Variant, Variant> = {
      primary: "secondary",
      secondary: "danger",
      danger: "primary",
    }

    return (
      <Button
        onClick={() => {
          setShowcaseVariant((s) => nextVariant[s])
        }}
      >
        Cycle Variant
      </Button>
    )
  }

  const HeightSetter = () => {
    const nextHeightIndex: Record<Size, Size> = {
      small: "medium",
      medium: "large",
      large: "small",
    }
    return (
      <div>
        <Button onClick={() => setShowcaseSize((s) => nextHeightIndex[s])}>
          cycle size
        </Button>
      </div>
    )
  }

  return (
    <>
      <h3>Buttons</h3>
      <div className={styles.buttons}>
        <div className={styles.cycleButtons}>
          <HeightSetter />
          <VariantSetter />
        </div>
        <Button size={showcaseSize} variant={showcaseVariant}>
          {`${showcaseSize} ${showcaseVariant}`}
        </Button>
      </div>
    </>
  )
}

const ElementsPage = () => {
  return (
    <div className={styles.elementsPage}>
      <h2>Components</h2>
      <br />

      <Buttons />
      <ThemeColours />
    </div>
  )
}

export default ElementsPage
