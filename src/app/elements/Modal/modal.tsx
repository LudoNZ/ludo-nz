import React, { JSX, useState } from "react"
import styles from "./modal.module.scss"
import Button from "@/components/button/button"

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
