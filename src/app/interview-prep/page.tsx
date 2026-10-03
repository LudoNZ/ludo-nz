import type { Metadata } from "next"
import InterviewPrepPage from "./interviewPrepPage"

// Linked from the nav for signed-in users only, and kept out of search results.
// Signed-in users only — the course content is fetched by the client
// through a token-checked server action (see interviewPrep/actions.ts).
export const metadata: Metadata = {
  title: "Interview prep",
  robots: { index: false, follow: false },
}

export default function Page() {
  return <InterviewPrepPage />
}
