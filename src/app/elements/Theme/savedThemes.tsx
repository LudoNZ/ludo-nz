import { Theme } from "./Theme"

const defaultTheme = new Theme(
  "default",
  "#ffffff",
  "#171717",
  "#1bb12f",
  "#b1ae1b",
  "#b11b1b",
  "8px"
)
const purpleHaze = new Theme(
  "Purple Haze",
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

export const themes: Theme[] = [defaultTheme, purpleHaze, shadUi, gingerMode]
