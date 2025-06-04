import { useReducer, useState } from "react"
import { themes } from "./savedThemes"
import { ThemeDemo } from "./themeDemo"
import { ThemeEdit } from "./themeEdit"
import styles from "./themeSelector.module.scss"
import { themeReducer } from "./themeReducer"

export const ThemeSelector = () => {
  const [state, dispatch] = useReducer(themeReducer, themes[0])
  const [themeSelection, setThemes] = useState(themes)

  return (
    <div>
      <h2>Theme Selector</h2>
      <div className={styles.themeTemplates}>
        {themeSelection.map((theme) => (
          <div key={theme.name} className={styles.template}>
            <ThemeDemo
              theme={theme}
              editTheme={() => dispatch({ type: "set", value: theme })}
            />
          </div>
        ))}
      </div>
      <ThemeEdit
        theme={state}
        dispatch={dispatch}
        addTheme={() => setThemes((currentThemes) => [...currentThemes, state])}
      />
    </div>
  )
}
