import type { Exercise, LessonContent, MdBlock } from "./types"

/** A deliberately small markdown dialect for the lesson files: headings,
 * paragraphs, single-level lists, fenced code, pipe tables and blockquotes.
 * Inline formatting (`code`, **bold**, *italic*, [links](url)) is left in
 * the text and handled at render time. Anything fancier isn't needed, and
 * keeping it this small means no markdown dependency. */
export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n")
  const blocks: MdBlock[] = []
  let i = 0

  const isListItem = (l: string) => /^\s*([-*]|\d+\.)\s+/.test(l)
  const startsBlock = (l: string) =>
    /^#{1,6}\s/.test(l) || l.startsWith("```") || l.startsWith("|") || l.startsWith(">") || isListItem(l)

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() })
      i++
      continue
    }

    if (line.startsWith("```")) {
      const info = line.slice(3).trim()
      const [lang = "", ...meta] = info.split(/\s+/)
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++])
      if (i >= lines.length) throw new Error(`Unclosed code fence starting "${line}"`)
      i++ // closing fence
      blocks.push({ type: "code", lang, meta: meta.join(" "), code: code.join("\n") })
      continue
    }

    if (line.startsWith("|")) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, "")
          .split(/(?<!\\)\|/)
          .map((c) => c.trim().replace(/\\\|/g, "|"))
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells)
        i++
      }
      const [head, ...body] = rows
      blocks.push({ type: "table", head, rows: body })
      continue
    }

    if (line.startsWith(">")) {
      const text: string[] = []
      while (i < lines.length && lines[i].startsWith(">")) text.push(lines[i++].replace(/^>\s?/, ""))
      blocks.push({ type: "quote", text: text.join(" ").trim() })
      continue
    }

    if (isListItem(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      while (i < lines.length && (isListItem(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (isListItem(lines[i])) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""))
        else items[items.length - 1] += " " + lines[i].trim()
        i++
      }
      blocks.push({ type: "list", ordered, items })
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) para.push(lines[i++].trim())
    blocks.push({ type: "paragraph", text: para.join(" ") })
  }

  return blocks
}

const SECTIONS = {
  explanation: "explanation",
  workedExample: "worked example",
  exercises: "exercises",
  sayItAloud: "say it aloud",
} as const

/** Splits blocks at headings of `level`, returning [heading text, blocks
 * under it] pairs. Blocks before the first such heading are dropped. */
function splitAt(blocks: MdBlock[], level: number): [string, MdBlock[]][] {
  const out: [string, MdBlock[]][] = []
  for (const b of blocks) {
    if (b.type === "heading" && b.level === level) out.push([b.text, []])
    else if (out.length) out[out.length - 1][1].push(b)
  }
  return out
}

/** Splits `blocks` at the first level-4 heading named `name` (e.g. "Solution"). */
function splitReveal(blocks: MdBlock[], name: string, where: string): [MdBlock[], MdBlock[]] {
  const idx = blocks.findIndex((b) => b.type === "heading" && b.level === 4 && b.text.toLowerCase() === name.toLowerCase())
  if (idx === -1) throw new Error(`${where}: missing "#### ${name}"`)
  return [blocks.slice(0, idx), blocks.slice(idx + 1)]
}

/** Parses one lesson file. Lessons have exactly four "##" sections —
 * Explanation, Worked example, Exercises, Say it aloud — and throw at
 * build time if one is missing, so a bad edit can't ship silently. */
export function parseLesson(src: string, where = "lesson"): LessonContent {
  const sections = new Map(splitAt(parseMarkdown(src), 2).map(([title, body]) => [title.toLowerCase(), body]))
  const get = (name: string) => {
    const body = sections.get(name)
    if (!body) throw new Error(`${where}: missing "## ${name}" section`)
    return body
  }

  const exercises: Exercise[] = splitAt(get(SECTIONS.exercises), 3).map(([heading, body]) => {
    const grade = heading.match(/\[(\d)\]\s*$/)
    const [prompt, solution] = splitReveal(body, "Solution", `${where} › ${heading}`)
    return {
      title: heading.replace(/\s*\[\d\]\s*$/, ""),
      grade: grade ? Number(grade[1]) : null,
      prompt,
      solution,
    }
  })
  if (!exercises.length) throw new Error(`${where}: "## Exercises" has no "### " exercises`)

  const [question, modelAnswer] = splitReveal(get(SECTIONS.sayItAloud), "Model answer", `${where} › Say it aloud`)

  return {
    explanation: get(SECTIONS.explanation),
    workedExample: get(SECTIONS.workedExample),
    exercises,
    sayItAloud: { question, modelAnswer },
  }
}
