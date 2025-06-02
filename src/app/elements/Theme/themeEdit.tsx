import React, { useState } from "react"
import { setTheme, Theme } from "./Theme"
import styles from "./themeEdit.module.scss"
import { ThemeReducerActions } from "./themeReducer"
import Button from "@/components/button/button"

export const ThemeEdit: React.FC<{
  theme: Theme
  dispatch: React.Dispatch<ThemeReducerActions>
}> = ({ theme, dispatch }) => {
  const ColourProperty: React.FC<{
    propertyName: string
    hexValue: string
    onChange: (value: string) => void
  }> = ({ propertyName, hexValue, onChange }) => {
    const [value, setValue] = useState(hexValue)
    return (
      <div className={styles.colourProperty}>
        <span className={styles.propertyName}>{propertyName}:</span>
        <span>{hexValue}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setValue(e.target.value)
          }}
        />
      </div>
    )
  }

  return (
    <div className={styles.themeEdit}>
      <h2>Theme Editor</h2>
      <h3>{theme.name}</h3>
      <div className={styles.themeColours}>
        <ColourProperty
          propertyName="primary"
          hexValue={theme.colorPrimary}
          onChange={(value) =>
            dispatch({ type: "update", property: "colorPrimary", value: value })
          }
        />
        <ColourProperty
          propertyName="secondary"
          hexValue={theme.colorSecondary}
          onChange={(value) =>
            dispatch({
              type: "update",
              property: "colorSecondary",
              value: value,
            })
          }
        />
        <ColourProperty
          propertyName="background"
          hexValue={theme.background}
          onChange={(value) =>
            dispatch({ type: "update", property: "background", value: value })
          }
        />
        <ColourProperty
          propertyName="foreground"
          hexValue={theme.foreground}
          onChange={(value) =>
            dispatch({ type: "update", property: "foreground", value: value })
          }
        />
        <ColourProperty
          propertyName="danger"
          hexValue={theme.colorDanger}
          onChange={(value) =>
            dispatch({ type: "update", property: "colorDanger", value: value })
          }
        />
      </div>
      <Button onClick={() => setTheme(theme)}>Test Theme</Button>
    </div>
  )
}
