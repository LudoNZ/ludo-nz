import Button, { Size, Variant } from "@/components/button/button"
import { useState } from "react"
import styles from "./buttons.module.scss"

export const Buttons = () => {
  const [showcaseSize, setShowcaseSize] = useState<Size>("medium")
  const [showcaseVariant, setShowcaseVariant] = useState<Variant>("primary")

  const VariantSetter = () => {
    const nextVariant: Record<Variant, Variant> = {
      primary: "secondary",
      secondary: "danger",
      danger: "primary",
    }

    return (
      <Button
        onClick={() => {
          setShowcaseVariant((s) => nextVariant[s])
        }}
      >
        Cycle Variant
      </Button>
    )
  }

  const HeightSetter = () => {
    const nextHeightIndex: Record<Size, Size> = {
      small: "medium",
      medium: "large",
      large: "small",
    }
    return (
      <div>
        <Button onClick={() => setShowcaseSize((s) => nextHeightIndex[s])}>
          cycle size
        </Button>
      </div>
    )
  }

  return (
    <>
      <h3>Buttons</h3>
      <div className={styles.buttons}>
        <div className={styles.cycleButtons}>
          <HeightSetter />
          <VariantSetter />
        </div>
        <Button size={showcaseSize} variant={showcaseVariant}>
          {`${showcaseSize} ${showcaseVariant}`}
        </Button>
      </div>
    </>
  )
}
