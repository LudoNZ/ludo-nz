"use server"

import { getAuthAdmin } from "../../../firebase/server"
import { loadCourse } from "./loadCourse"
import type { Course } from "./types"

let cached: Course | null = null

/** Course content for a signed-in user. Takes a fresh Firebase ID token
 * (from `user.getIdToken()`) rather than trusting the auth cookie, which
 * isn't refreshed when the ID token rotates hourly. Content is only ever
 * sent from here, so it isn't in the page's static bundle for anonymous
 * visitors. */
export async function getCourse(idToken: string): Promise<Course> {
  await getAuthAdmin().verifyIdToken(idToken)
  // markdown is read off disk once per server instance; restart to pick up edits in production
  if (!cached || process.env.NODE_ENV !== "production") cached = loadCourse()
  return cached
}
