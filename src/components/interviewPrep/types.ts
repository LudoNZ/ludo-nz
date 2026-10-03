/** Shapes shared by the /interview-prep course: the hand-edited course
 * outline (src/content/interview-prep/course.ts), the markdown lessons it
 * points at, and the parsed form the page renders. */

export interface LessonOutline {
  /** Also the markdown file name (without .md) inside the module's folder. */
  slug: string
  title: string
  minutes: number
  /** In the "short on time" subset. */
  core: boolean
}

export interface ModuleOutline {
  /** Also the module's folder name under lessons/. */
  id: string
  title: string
  hours: number
  summary: string
  lessons: LessonOutline[]
}

export interface CourseOutline {
  /** "YYYY-MM-DD", or null while it's not set. Drives the day-by-day plan. */
  interviewDate: string | null
  /** Study budget the day-by-day plan packs lessons into. */
  hoursPerDay: number
  modules: ModuleOutline[]
}

// ---------- parsed markdown ----------

export type MdBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; lang: string; meta: string; code: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "quote"; text: string }

export interface Exercise {
  title: string
  /** 1 (warm-up) to 3 (stretch); null when the heading has no [n] tag. */
  grade: number | null
  prompt: MdBlock[]
  solution: MdBlock[]
}

export interface LessonContent {
  explanation: MdBlock[]
  workedExample: MdBlock[]
  exercises: Exercise[]
  sayItAloud: { question: MdBlock[]; modelAnswer: MdBlock[] }
}

export interface Lesson extends LessonOutline {
  /** Globally unique: `${moduleId}/${slug}` — the localStorage key and URL hash. */
  id: string
  content: LessonContent
}

export interface Module extends Omit<ModuleOutline, "lessons"> {
  lessons: Lesson[]
}

export interface Course {
  interviewDate: string | null
  hoursPerDay: number
  modules: Module[]
}
