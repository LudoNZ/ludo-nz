"use client"

import Button, { Size, Variant } from "@/components/button/button"
import styles from "./elementsPage.module.scss"
import { useEffect, useState } from "react"

const Buttons = () => {
  const [showcaseSize, setShowcaseSize] = useState<Size>("medium")
  const [showcaseVariant, setShowcaseVariant] = useState<Variant>("primary")

  return (
    <>
      <h3>Buttons</h3>
      <div className={styles.buttons}>
        <Button
          onClick={() => {
            setShowcaseVariant("primary")
          }}
        >
          <p>primary</p>
        </Button>
        <Button
          children={`Secondary`}
          variant="secondary"
          onClick={() => {
            setShowcaseVariant("secondary")
          }}
        />
        <Button
          children={`Danger`}
          variant="danger"
          onClick={() => {
            setShowcaseVariant("danger")
          }}
        />
        <Button size={showcaseSize} variant={showcaseVariant}>
          Showcase Button
        </Button>
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
      </div>
    </>
  )
}

const ElementsPage = () => {
  return (
    <div>
      <h2>ELEMENTS</h2>
      <br />

      <Buttons />
    </div>
  )
}

export default ElementsPage
