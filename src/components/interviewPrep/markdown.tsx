import { Fragment } from "react"
import CodeBlock from "./codeBlock"
import type { MdBlock } from "./types"
import styles from "./markdown.module.scss"

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g

/** Inline formatting: `code`, **bold**, *italic* and [text](url). External
 * links open in a new tab. No nesting — the lessons don't need it. */
export const Inline: React.FC<{ text: string }> = ({ text }) => {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push(text.slice(last, idx))
    const tok = m[0]
    if (m[1]) parts.push(<code key={idx}>{tok.slice(1, -1)}</code>)
    else if (m[2]) parts.push(<strong key={idx}>{tok.slice(2, -2)}</strong>)
    else if (m[3]) parts.push(<em key={idx}>{tok.slice(1, -1)}</em>)
    else {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!
      const external = /^https?:/.test(href)
      parts.push(
        <a key={idx} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {label}
        </a>,
      )
    }
    last = idx + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

/** Renders parsed lesson markdown. Headings are shifted down so a lesson's
 * own "###" sits under the page's section headings. */
const Markdown: React.FC<{ blocks: MdBlock[] }> = ({ blocks }) => (
  <div className={styles.markdown}>
    {blocks.map((b, i) => {
      switch (b.type) {
        case "heading": {
          const Tag = `h${Math.min(b.level + 2, 6)}` as "h4" | "h5" | "h6"
          return (
            <Tag key={i}>
              <Inline text={b.text} />
            </Tag>
          )
        }
        case "paragraph":
          return (
            <p key={i}>
              <Inline text={b.text} />
            </p>
          )
        case "quote":
          return (
            <blockquote key={i}>
              <Inline text={b.text} />
            </blockquote>
          )
        case "list": {
          const Tag = b.ordered ? "ol" : "ul"
          return (
            <Tag key={i}>
              {b.items.map((item, j) => (
                <li key={j}>
                  <Inline text={item} />
                </li>
              ))}
            </Tag>
          )
        }
        case "code":
          return <CodeBlock key={i} lang={b.lang} meta={b.meta} code={b.code} />
        case "table":
          return (
            <div key={i} className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    {b.head.map((h, j) => (
                      <th key={j}>
                        <Inline text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k}>
                          <Inline text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        default:
          return <Fragment key={i} />
      }
    })}
  </div>
)

export default Markdown
