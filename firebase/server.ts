import admin from "firebase-admin"
import { getApps, ServiceAccount } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

/** an env var with stray whitespace removed: a secret saved from a file
 * often ends in a newline, and a newline on the client email makes every
 * Google API call fail with "16 UNAUTHENTICATED" */
const env = (name: string) => process.env[name]?.trim() || undefined

function getAdminApp() {
  const existing = getApps()
  if (existing.length > 0) return existing[0]

  if (env("FIREBASE_PRIVATE_KEY") && env("FIREBASE_CLIENT_EMAIL")) {
    const serviceAccount = {
      type: "service_account",
      project_id: "ludos-website",
      private_key_id: env("FIREBASE_PRIVATE_KEY_ID"),
      private_key: env("FIREBASE_PRIVATE_KEY")
        ?.replace(/^"|"$/g, "")
        ?.replace(/\\n/g, "\n"),
      client_email: env("FIREBASE_CLIENT_EMAIL"),
      client_id: env("FIREBASE_CLIENT_ID"),
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url:
        "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-qn1wq%40ludos-website.iam.gserviceaccount.com",
      universe_domain: "googleapis.com",
    }

    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as ServiceAccount),
    })
  }

  return admin.initializeApp()
}

export function getFirestoreAdmin() {
  return getFirestore(getAdminApp())
}

export function getAuthAdmin() {
  return getAuth(getAdminApp())
}
