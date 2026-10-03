import type { Confidence, Done } from "./plan"

export interface Progress {
  done: Done
  confidence: Confidence
}

/** Where a learner's progress lives. The page uses the Firestore store;
 * tests and previews use the in-memory one. */
export interface ProgressStore {
  subscribe(onData: (p: Progress) => void, onError?: (err: unknown) => void): () => void
  setLessonDone(lessonId: string, done: boolean): Promise<void>
  setModuleConfidence(moduleId: string, level: number | null): Promise<void>
}

export function memoryProgressStore(initial: Progress = { done: {}, confidence: {} }): ProgressStore {
  let state: Progress = { done: { ...initial.done }, confidence: { ...initial.confidence } }
  const listeners = new Set<(p: Progress) => void>()
  const emit = () => listeners.forEach((l) => l(state))
  return {
    subscribe(onData) {
      listeners.add(onData)
      onData(state)
      return () => listeners.delete(onData)
    },
    async setLessonDone(lessonId, done) {
      state = { ...state, done: { ...state.done, [lessonId]: done } }
      emit()
    },
    async setModuleConfidence(moduleId, level) {
      const confidence = { ...state.confidence }
      if (level === null) delete confidence[moduleId]
      else confidence[moduleId] = level
      state = { ...state, confidence }
      emit()
    },
  }
}
