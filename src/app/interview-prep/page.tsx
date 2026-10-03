import type { Metadata } from "next"
import InterviewPrepPage from "./interviewPrepPage"

// Unlisted: not in the site navigation, and kept out of search results.
// Signed-in users only — the course content is fetched by the client
// through a token-checked server action (see interviewPrep/actions.ts).
export const metadata: Metadata = {
  title: "Interview prep",
  robots: { index: false, follow: false },
}

export default function Page() {
  return <InterviewPrepPage />
}
