import Button from "@/components/button/button"
import { Theme } from "./Theme"
import styles from "./themeDemo.module.scss"

export const ThemeDemo: React.FC<{ theme: Theme }> = ({ theme }) => (
  <div
    className={styles.themeDemo}
    style={{ backgroundColor: theme.background, color: theme.foreground }}
  >
    <h4>{theme.name}</h4>
    <Button variant="primary">Primary</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="danger">Danger</Button>
  </div>
)
