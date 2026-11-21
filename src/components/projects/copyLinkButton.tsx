"use client"

import { useState } from "react"
import Button from "@/components/button/button"

/** Copies this page's link (or `url`) to share a public project — with a
 * fallback for browsers that refuse the clipboard. */
const CopyLinkButton: React.FC<{ url?: string }> = ({ url }) => {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null)
  const copy = async () => {
    const link = url ? new URL(url, window.location.origin).href : window.location.href
    let ok = false
    try {
      await navigator.clipboard.writeText(link)
      ok = true
    } catch {
      // older browsers, or a page not served over https: copy out of a
      // throwaway text box instead
      const box = document.createElement("textarea")
      box.value = link
      box.setAttribute("readonly", "")
      box.style.position = "fixed"
      box.style.opacity = "0"
      document.body.appendChild(box)
      box.select()
      try {
        ok = document.execCommand("copy")
      } catch {
        ok = false
      }
      box.remove()
    }
    setCopied(ok ? "yes" : "failed")
    setTimeout(() => setCopied(null), 2500)
  }
  return (
    <Button size="small" variant="secondary" onClick={copy}>
      {copied === "yes" ? "Link copied ✓" : copied === "failed" ? "Couldn't copy — use the address bar" : "Copy link"}
    </Button>
  )
}

export default CopyLinkButton
