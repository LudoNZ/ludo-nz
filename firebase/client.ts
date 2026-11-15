// Import the functions you need from the SDKs you need
import { initializeApp, getApps } from "firebase/app"
import { getAnalytics } from "firebase/analytics"
import { Auth, getAuth } from "firebase/auth"
import { FirebaseStorage, getStorage } from "firebase/storage"
import { Firestore, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore"
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Initialize Firebase
const currentApps = getApps()
let auth: Auth
let storage: FirebaseStorage
let firestore: Firestore

if (!currentApps.length) {
  const app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  storage = getStorage(app)
  // In the browser, keep Firestore's cache on the device (IndexedDB, shared
  // across tabs) rather than in memory: documents read once can be read
  // again with no connection, and writes made offline survive a reload and
  // sync when the connection comes back. On the server there's no
  // IndexedDB — plain in-memory Firestore, as before.
  firestore =
    typeof window !== "undefined"
      ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
      : getFirestore(app)
} else {
  const app = currentApps[0]
  auth = getAuth(app)
  storage = getStorage(app)
  firestore = getFirestore(app)
}
// const app = initializeApp(firebaseConfig)
// const analytics = getAnalytics(app)
export { auth, storage, firestore }
