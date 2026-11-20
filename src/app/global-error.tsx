"use client"

import "/src/styles/global.scss"
import AppErrorScreen from "@/components/appError/appErrorScreen"

/** A crash in the root layout itself (header, sign-in), where app/error.tsx
 * can't reach: replaces the whole document, so it brings its own html/body. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <AppErrorScreen error={error} reset={reset} />
      </body>
    </html>
  )
}
