import React, { useEffect, useState } from "react"
import { setTheme, Theme } from "./Theme"
import styles from "./themeEdit.module.scss"
import { ThemeReducerActions } from "./themeReducer"
import Button from "@/components/button/button"
import { Modal } from "../Modal/modal"
import { SvgPencil } from "@/icons/pencil-solid"

export const ThemeEdit: React.FC<{
  theme: Theme
  dispatch: React.Dispatch<ThemeReducerActions>
  addTheme: () => void
}> = ({ theme, dispatch, addTheme }) => {
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

  const EditNameProperty: React.FC = () => {
    const [editingName, setEditingName] = useState(false)
    const [formString, setFormString] = useState(theme.name)

    const closeModal = () => {
      setEditingName(false)
      setFormString(theme.name)
    }

    return (
      <>
        <div
          className={styles.nameProperty}
          onClick={() => {
            setEditingName(true)
          }}
        >
          <span>name:</span>
          <span className={styles.name}>
            {theme.name}
            <span className={styles.pencilBox}>
              <SvgPencil />
            </span>
          </span>
        </div>
        <Modal closeModal={() => closeModal()} isActive={editingName}>
          <form
            className={styles.editNameModalContent}
            onSubmit={(e) => {
              e.preventDefault()
              if (!editingName) return //negate inactive 'Enter' action
              dispatch({
                property: "name",
                type: "update",
                value: formString,
              })
              setEditingName(false)
            }}
          >
            <h4>Edit Name:</h4>
            <div className="flex">
              <input
                type="text"
                value={formString}
                onChange={(e) => setFormString(e.target.value)}
              />
              <Button type="submit" onClick={() => {}}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      </>
    )
  }

  return (
    <div className={styles.themeEdit}>
      <h2>Theme Editor</h2>

      <div className={styles.themeColours}>
        <EditNameProperty />

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
        <div className={styles.editorButtons}>
          <Button onClick={() => setTheme(theme)}>Test Theme</Button>
          <Button onClick={() => addTheme()}>Save Theme</Button>
        </div>
      </div>
    </div>
  )
}
