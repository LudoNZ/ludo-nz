"use client"

import AppErrorScreen from "@/components/appError/appErrorScreen"

/** A crash in any page: shown inside the site's header and footer. See
 * AppErrorScreen — it reloads once by itself first. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AppErrorScreen error={error} reset={reset} />
}
