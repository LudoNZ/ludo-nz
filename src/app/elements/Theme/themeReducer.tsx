import { Theme } from "./Theme"

export type ThemeReducerActions =
  | {
      type: "set"
      value: Theme
    }
  | {
      type: "update"
      property: keyof Theme
      value: string | Theme
    }

export function themeReducer(theme: Theme, action: ThemeReducerActions): Theme {
  switch (action.type) {
    case "set":
      return action.value
    case "update":
      return {
        ...theme,
        [action.property]: action.value,
      }
    default:
      return theme
  }
}
