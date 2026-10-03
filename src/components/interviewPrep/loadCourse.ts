import { readFileSync } from "node:fs"
import path from "node:path"
import { course as outline } from "@/content/interview-prep/course"
import { parseLesson } from "./parseLesson"
import type { Course } from "./types"

export const LESSONS_DIR = path.join(process.cwd(), "src/content/interview-prep/lessons")

/** Server-only: reads every lesson's markdown off disk and parses it. Runs
 * at build time (the page is static), so a missing file or section fails
 * the build rather than the page. */
export function loadCourse(): Course {
  return {
    interviewDate: outline.interviewDate,
    hoursPerDay: outline.hoursPerDay,
    modules: outline.modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => {
        const file = path.join(LESSONS_DIR, m.id, `${l.slug}.md`)
        return { ...l, id: `${m.id}/${l.slug}`, content: parseLesson(readFileSync(file, "utf8"), `${m.id}/${l.slug}.md`) }
      }),
    })),
  }
}
