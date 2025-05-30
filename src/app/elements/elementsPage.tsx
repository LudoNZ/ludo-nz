"use client"

import Button, { Size, Variant } from "@/components/button/button"
import styles from "./elementsPage.module.scss"
import { useState } from "react"

const ThemeColours = () => {
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
