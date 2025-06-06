"use client"

import Button from "@/components/button/button"
import { setTheme, Theme } from "./Theme"
import styles from "./themeDemo.module.scss"

export const ThemeDemo: React.FC<{
  theme: Theme
  editTheme: () => void
  deleteTheme: () => void
}> = ({ theme, editTheme, deleteTheme }) => {
  const themeStyles: React.CSSProperties = {
    color: theme.foreground,
    // These are custom CSS variables
    ["--background" as string]: theme.background,
    ["--foreground" as string]: theme.foreground,
    ["--color-primary" as string]: theme.colorPrimary,
    ["--color-secondary" as string]: theme.colorSecondary,
    ["--color-danger" as string]: theme.colorDanger,
  }
  return (
    <div className={styles.themeDemo} style={themeStyles}>
      <h3>{theme.name}</h3>
      <p>
        Lorem ipsum dolor sit amet consectetur adipisicing elit. Eius libero ex.
      </p>
      <div className="flex">
        <Button variant="primary" onClick={() => setTheme(theme)}>
          Select
        </Button>
        <Button variant="secondary" onClick={() => editTheme()}>
          Edit
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            deleteTheme()
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}
