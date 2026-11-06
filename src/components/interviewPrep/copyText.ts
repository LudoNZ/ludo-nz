/** Put text on the clipboard, working in more places than
 * navigator.clipboard alone: that API only exists on secure pages
 * (https or localhost), so it's missing entirely when the dev server is
 * opened from a tablet at http://<lan-ip>:3000, and some mobile browsers
 * refuse it anyway. The fallback is the old select-a-textarea-and-copy
 * route, which still works there. Resolves true if either way worked —
 * call it straight from the click so the copy counts as user-initiated. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof window !== "undefined" && window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through to the textarea route
    }
  }
  return copyViaTextarea(text)
}

function copyViaTextarea(text: string): boolean {
  const ta = document.createElement("textarea")
  ta.value = text
  ta.setAttribute("readonly", "")
  // on screen but invisible: some mobile browsers won't select off-screen text
  ta.style.position = "fixed"
  ta.style.top = "0"
  ta.style.left = "0"
  ta.style.width = "1px"
  ta.style.height = "1px"
  ta.style.opacity = "0"
  document.body.appendChild(ta)
  const selection = document.getSelection()
  const previous = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  ta.focus()
  ta.select()
  ta.setSelectionRange(0, text.length) // iOS needs the explicit range
  let ok = false
  try {
    ok = document.execCommand("copy")
  } catch {
    ok = false
  }
  ta.remove()
  if (previous && selection) {
    selection.removeAllRanges()
    selection.addRange(previous)
  }
  return ok
}

/** Save text as a file. The blob: URL stays alive for a minute after the
 * click — revoking it straight away can cancel the save on Android
 * Chrome, Firefox and Safari before it has started. */
export function downloadText(text: string, fileName: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
