"use server"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { requireFeature } from "@/lib/members.server"
import { loadCourse } from "./loadCourse"
import type { Course } from "./types"

let cached: Course | null = null

/** Course content for a member granted interview prep. Takes a fresh Firebase ID token
 * (from `user.getIdToken()`) rather than trusting the auth cookie, which
 * isn't refreshed when the ID token rotates hourly. Content is only ever
 * sent from here, so it isn't in the page's static bundle for anonymous
 * visitors. */
export async function getCourse(idToken: string): Promise<Course> {
  await requireFeature(idToken, "interview-prep")
  // markdown is read off disk once per server instance; restart to pick up edits in production
  if (!cached || process.env.NODE_ENV !== "production") cached = loadCourse()
  return cached
}

/** The practice database seed (interview-prep/db/seed.sql), for the copy /
 * download buttons — same token check as the course content. */
export async function getSeedSql(idToken: string): Promise<string> {
  await requireFeature(idToken, "interview-prep")
  return readFile(path.join(process.cwd(), "interview-prep/db/seed.sql"), "utf8")
}
