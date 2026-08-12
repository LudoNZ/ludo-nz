import { addDoc, collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import { CalcSettings } from "./calcSettings"
import { ControlPoints, CornerPosts } from "./postProfile"
import { SoilType } from "./retainingWallCalc"

/** Both collections are public (no auth) — saved presets and designs are
 * visible/listable to anyone, by design, for now. See firestore.rules:
 * create is allowed for anyone with a valid shape, update/delete are
 * disabled entirely, so a save is a new, immutable, named entry rather
 * than something that can be overwritten or vandalised in place. */
const calcSettingsRef = () => collection(firestore, "retainingWallCalcSettings")
const designsRef = () => collection(firestore, "retainingWallDesigns")

export interface SavedCalcSettings {
  id: string
  name: string
  settings: CalcSettings
  createdAt: Date
}

export const subscribeToCalcSettingsList = (onData: (list: SavedCalcSettings[]) => void, onError?: (err: unknown) => void) => {
  const q = query(calcSettingsRef(), orderBy("createdAt", "desc"))
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: data.name,
            settings: data.settings as CalcSettings,
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
          }
        })
      )
    },
    onError
  )
}

export const saveCalcSettings = async (name: string, settings: CalcSettings): Promise<string> => {
  const doc = await addDoc(calcSettingsRef(), { name, settings, createdAt: Timestamp.now() })
  return doc.id
}

export interface SavedWallDesign {
  id: string
  name: string
  wallLengthM: number
  retainedHeightM: number
  soil: SoilType
  rlDatumM: number
  controlPoints: ControlPoints
  cornerPosts: CornerPosts
  calcSettings: CalcSettings
  createdAt: Date
}

export const subscribeToDesigns = (onData: (list: SavedWallDesign[]) => void, onError?: (err: unknown) => void) => {
  const q = query(designsRef(), orderBy("createdAt", "desc"))
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: data.name,
            wallLengthM: data.wallLengthM,
            retainedHeightM: data.retainedHeightM,
            soil: data.soil as SoilType,
            rlDatumM: data.rlDatumM ?? 0,
            controlPoints: (data.controlPoints ?? {}) as ControlPoints,
            cornerPosts: (data.cornerPosts ?? {}) as CornerPosts,
            calcSettings: data.calcSettings as CalcSettings,
            createdAt: data.createdAt?.toDate?.() ?? new Date(),
          }
        })
      )
    },
    onError
  )
}

export const saveDesign = async (name: string, design: Omit<SavedWallDesign, "id" | "createdAt" | "name">): Promise<string> => {
  const doc = await addDoc(designsRef(), { ...design, name, createdAt: Timestamp.now() })
  return doc.id
}
