// Import the functions you need from the SDKs you need
import { initializeApp, getApps } from "firebase/app"
import { getAnalytics } from "firebase/analytics"
import { Auth, getAuth } from "firebase/auth"
import { FirebaseStorage, getStorage } from "firebase/storage"
import { Firestore, getFirestore } from "firebase/firestore"
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
  firestore = getFirestore(app)
} else {
  const app = currentApps[0]
  auth = getAuth(app)
  storage = getStorage(app)
  firestore = getFirestore(app)
}
// const app = initializeApp(firebaseConfig)
// const analytics = getAnalytics(app)
export { auth, storage, firestore }
