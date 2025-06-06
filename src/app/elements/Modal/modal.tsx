import React, { JSX, useEffect } from "react"
import styles from "./modal.module.scss"

interface ModalParams {
  isActive: boolean
  closeModal: () => void
  children: JSX.Element
}

export const Modal: React.FC<ModalParams> = ({
  isActive,
  closeModal,
  children,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key == "Escape") {
        closeModal()
      }
    }

    if (isActive) {
      window.addEventListener("keydown", handleKeyDown)
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isActive, closeModal])

  return (
    <div
      className={styles.modalPosition}
      onClick={() => closeModal()}
      style={{ pointerEvents: isActive ? "all" : "none" }}
    >
      <div className={`${styles.backdrop} ${isActive && styles.active}`} />
      <div
        className={`${styles.modal} ${isActive ? styles.modalActive : ""}
        `}
      >
        <div
          className={styles.modalContent}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
