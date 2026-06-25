import { NextRequest, NextResponse } from "next/server"
import { getFirestoreAdmin, getAuthAdmin } from "../../../../../firebase/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get("firebaseAuthToken")?.value
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const auth = getAuthAdmin()
    const verified = await auth.verifyIdToken(token)
    const user = await auth.getUser(verified.uid)
    if (!user.customClaims?.admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  } catch (e) {
    return NextResponse.json({ error: "Invalid token", detail: String(e) }, { status: 401 })
  }

  const filter = request.nextUrl.searchParams.get("filter") || "recent"
  const db = getFirestoreAdmin()

  try {
    const snapshot = await db.collection("diceSessions").get()

    const sessions = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data()
        const rollsSnap = await db
          .collection("diceSessions")
          .doc(doc.id)
          .collection("rolls")
          .count()
          .get()

        return {
          code: doc.id,
          creatorName: data.creatorName,
          players: data.players || [],
          currentGame: data.currentGame ?? 1,
          games: data.games || [],
          rollCount: rollsSnap.data().count,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        }
      })
    )

    if (filter === "popular") {
      sessions.sort((a, b) => b.rollCount - a.rollCount)
    } else {
      sessions.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
    }
    sessions.length = Math.min(sessions.length, 10)

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error("Error fetching dice sessions:", error)
    return NextResponse.json({ error: "Failed to fetch sessions", detail: String(error) }, { status: 500 })
  }
}
