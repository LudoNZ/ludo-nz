"use client"

import Markdown from "./markdown"
import Reveal from "./reveal"
import type { Lesson } from "./types"
import styles from "./lessonView.module.scss"

const GRADE_LABELS: Record<number, string> = { 1: "Warm-up", 2: "Core", 3: "Stretch" }

/** One lesson's four parts: explanation, worked example, exercises with
 * hidden solutions, and a two-minute "say it aloud" question. */
const LessonView: React.FC<{ lesson: Lesson }> = ({ lesson }) => {
  const { explanation, workedExample, exercises, sayItAloud } = lesson.content
  return (
    <div className={styles.lessonView}>
      <section>
        <h3>Explanation</h3>
        <Markdown blocks={explanation} />
      </section>

      <section>
        <h3>Worked example</h3>
        <Markdown blocks={workedExample} />
      </section>

      <section>
        <h3>Exercises</h3>
        <ol className={styles.exercises}>
          {exercises.map((ex, i) => (
            <li key={i} className={styles.exercise}>
              <div className={styles.exerciseHeader}>
                <h4>{ex.title}</h4>
                {ex.grade !== null && (
                  <span className={styles.grade} data-grade={ex.grade}>
                    {"●".repeat(ex.grade)}
                    {"○".repeat(3 - ex.grade)} {GRADE_LABELS[ex.grade]}
                  </span>
                )}
              </div>
              <Markdown blocks={ex.prompt} />
              <Reveal label="Solution">
                <Markdown blocks={ex.solution} />
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.sayItAloud}>
        <h3>Say it aloud</h3>
        <p className={styles.sayHint}>Set a two-minute timer and answer out loud as if to an interviewer. Then compare.</p>
        <Markdown blocks={sayItAloud.question} />
        <Reveal label="Model answer">
          <Markdown blocks={sayItAloud.modelAnswer} />
        </Reveal>
      </section>
    </div>
  )
}

export default LessonView
