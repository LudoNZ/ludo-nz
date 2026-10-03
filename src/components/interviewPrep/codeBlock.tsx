"use client"

import { useEffect, useRef, useState } from "react"
import styles from "./codeBlock.module.scss"

const LANG_LABELS: Record<string, string> = {
  sql: "SQL",
  ts: "TypeScript",
  tsx: "TSX",
  bash: "Terminal",
  yaml: "YAML",
  json: "JSON",
  text: "",
}

/** A fenced code block with a language/file label and a copy button. The
 * fence meta may carry `file=path/name.ts`, shown as the label. */
const CodeBlock: React.FC<{ lang: string; meta: string; code: string }> = ({ lang, meta, code }) => {
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const file = meta.match(/(?:^|\s)file=(\S+)/)?.[1]
  const label = file ?? LANG_LABELS[lang] ?? lang

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied("ok")
    } catch {
      setCopied("failed")
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(null), 1600)
  }

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span>{label}</span>
        <button type="button" onClick={copy} className={styles.copyButton} aria-label="Copy code to clipboard">
          {copied === "ok" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export default CodeBlock
