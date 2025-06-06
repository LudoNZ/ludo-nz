import { useEffect, useReducer, useState } from "react"
import { themes } from "./savedThemes"
import { ThemeDemo } from "./themeDemo"
import { ThemeEdit } from "./themeEdit"
import styles from "./themeSelector.module.scss"
import { themeReducer } from "./themeReducer"
import { Theme } from "./Theme"
import Button from "@/components/button/button"
import { stringify } from "querystring"

export const ThemeSelector = () => {
  const [state, dispatch] = useReducer(themeReducer, themes[0])
  const [themeSelection, setThemes] = useState<Theme[]>([])

  useEffect(() => {
    const storedThemes = localStorage.getItem("themes")

    const savedThemes: Theme[] = storedThemes
      ? (JSON.parse(storedThemes) as Theme[])
      : themes

    setThemes(savedThemes)
  }, [])

  return (
    <div>
      <h2>Theme Selector</h2>
      <div className={styles.themeTemplates}>
        {themeSelection.map((theme) => (
          <div key={theme.name} className={styles.template}>
            <ThemeDemo
              theme={theme}
              editTheme={() => dispatch({ type: "set", value: theme })}
              deleteTheme={() =>
                setThemes((themes) =>
                  themes.filter((t) => t.name != state.name)
                )
              }
            />
          </div>
        ))}
      </div>
      <br />
      <ThemeEdit
        theme={state}
        dispatch={dispatch}
        addTheme={() =>
          setThemes((currentThemes): Theme[] => {
            const isExistingTheme: () => boolean = () =>
              !!currentThemes.filter((theme) => theme.name == state.name).length

            if (isExistingTheme()) {
              return currentThemes.map((theme) => {
                if (theme.name == state.name) {
                  return state
                } else return theme
              })
            } else return [...currentThemes, state]
          })
        }
      />

      <Button
        onClick={() =>
          localStorage.setItem("themes", JSON.stringify(themeSelection))
        }
      >
        Save Themes to browser storage
      </Button>
    </div>
  )
}
