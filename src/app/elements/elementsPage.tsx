"use client"

import styles from "./elementsPage.module.scss"
import { themes } from "./Theme/savedThemes"
import { RenderThemePallete } from "./Theme/Theme"
import { ThemeSelector } from "./Theme/themeSelector"
import { Buttons } from "./Buttons/buttons"

export const ThemeColours = () => {
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
          <div key={index}>
            <RenderThemePallete theme={theme} />
          </div>
        ))}
      </div>
    </div>
  )
}

const ElementsPage = () => {
  return (
    <div className={styles.elementsPage}>
      <h2>Components</h2>
      <br />
      <Buttons />
      <br />
      <ThemeSelector />
    </div>
  )
}

export default ElementsPage
