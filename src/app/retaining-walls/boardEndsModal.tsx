"use client"

import { Modal } from "@/app/elements/Modal/modal"
import styles from "./boardEndsModal.module.scss"

/** A wall end seen from above: the end post, the next post along, and
 * the board fixed across their backs — drawn either running to the
 * outside face of the end post or stopping at its centre, with the
 * length the calculator measures marked underneath. Schematic, not to
 * scale. */
const EndIllustration: React.FC<{ toOutside: boolean }> = ({ toOutside }) => {
  const post = 34
  const endX = 60 // centre of the end post
  const nextX = 250
  const postY = 44
  const boardStart = toOutside ? endX - post / 2 : endX
  const dimY = 104
  return (
    <svg viewBox="0 0 300 130" className={styles.svg} role="img" aria-label={toOutside ? "Board running to the outside face of the end post" : "Board stopping at the centre of the end post"}>
      {/* retained ground behind the board */}
      <rect x={0} y={0} width={300} height={22} className={styles.ground} />
      <text x={292} y={15} textAnchor="end" className={styles.small}>
        retained ground
      </text>
      {/* the board, across the back of the posts, carrying on to the right */}
      <rect x={boardStart} y={22} width={300 - boardStart} height={14} className={styles.board} />
      {/* the part that makes the difference */}
      {toOutside && <rect x={boardStart} y={22} width={post / 2} height={14} className={styles.extra} />}
      {/* posts */}
      <rect x={endX - post / 2} y={36} width={post} height={post} className={styles.post} />
      <rect x={nextX - post / 2} y={36} width={post} height={post} className={styles.post} />
      <text x={endX} y={postY + 14} textAnchor="middle" className={styles.postLabel}>
        end
      </text>
      {/* post centre lines */}
      <line x1={endX} x2={endX} y1={16} y2={dimY + 8} className={styles.centreLine} />
      <line x1={nextX} x2={nextX} y1={16} y2={dimY + 8} className={styles.centreLine} />
      {/* what gets measured */}
      <line x1={boardStart} x2={nextX} y1={dimY} y2={dimY} className={styles.dim} />
      <line x1={boardStart} x2={boardStart} y1={dimY - 6} y2={dimY + 6} className={styles.dim} />
      <line x1={nextX} x2={nextX} y1={dimY - 6} y2={dimY + 6} className={styles.dim} />
      <text x={(boardStart + nextX) / 2} y={dimY + 18} textAnchor="middle" className={styles.dimLabel}>
        {toOutside ? "post centres + half a post" : "post centres"}
      </text>
    </svg>
  )
}

/** Chooses how the boards at each end of a wall are measured. Lives in
 * its own modal so the choice can be explained properly (with a picture)
 * without taking up room on the page. */
const BoardEndsModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  toOutside: boolean
  onChange: (toOutside: boolean) => void
  /** m, for spelling out what the choice adds on this wall */
  endPostWidthM: number | null
  wallCount: number
}> = ({ isOpen, onClose, toOutside, onChange, endPostWidthM, wallCount }) => {
  const halfMm = endPostWidthM ? Math.round((endPostWidthM * 1000) / 2) : null
  const option = (value: boolean, title: string, body: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={toOutside === value}
      className={toOutside === value ? styles.optionSelected : styles.option}
      onClick={() => onChange(value)}
    >
      <span className={styles.optionTitle}>
        <span className={styles.radio} aria-hidden="true" />
        {title}
      </span>
      <EndIllustration toOutside={value} />
      <span className={styles.optionBody}>{body}</span>
    </button>
  )
  return (
    <Modal isActive={isOpen} closeModal={onClose}>
      <div className={styles.content}>
        <div className={styles.header}>
          <h2>Board ends</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className={styles.note}>
          How far the boards run at the two ends of each wall. Both pictures look down on a wall end from above. Mid-wall
          joins aren&apos;t affected — two boards always share a post there, each to its centre.
        </p>
        <div className={styles.options} role="radiogroup" aria-label="Where boards end at each end of a wall">
          {option(
            true,
            "To the outside of the end post",
            "The board covers the whole end post, finishing flush with its outside face. Each end board is half a post longer than the post centres.",
          )}
          {option(
            false,
            "To the centre of the end post",
            "The board stops on the centre line of the end post, so lengths are simply post centre to post centre.",
          )}
        </div>
        <p className={styles.impact}>
          {toOutside ? "On this project: " : "Switching to the outside of the post on this project: "}
          {halfMm ? `${halfMm} mm` : "half a post"} is added at each end of {wallCount > 1 ? `each of the ${wallCount} walls` : "the wall"}
          {wallCount > 1 ? ", corners included" : ""}, on every row, the top board and the top cap. A wall that is exactly a
          stock length between post centres will then need a join, because its boards come out slightly longer than the
          stock.
        </p>
        <div className={styles.footer}>
          <button type="button" className={styles.done} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default BoardEndsModal
