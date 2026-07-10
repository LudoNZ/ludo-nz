export interface Source {
  type: string
  year?: string
  location?: string
}

export interface Person {
  id: string
  name: string
  /** Free-text relation label from the user's own research, e.g. "Great x 5 Grandmother" */
  label?: string
  birthYear?: string
  deathYear?: string
  confirmed: boolean
  notes?: string
  sources: Source[]
}

export interface ParentChildRelationship {
  id: string
  type: "parent-child"
  parent: string
  child: string
}

export interface SpouseRelationship {
  id: string
  type: "spouse"
  personA: string
  personB: string
  marriedYear?: string
  location?: string
}

export type Relationship = ParentChildRelationship | SpouseRelationship

export interface FamilyTreeData {
  people: Person[]
  relationships: Relationship[]
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function personById(people: Person[], id: string): Person | undefined {
  return people.find((p) => p.id === id)
}

export function getParents(personId: string, relationships: Relationship[]): string[] {
  return relationships
    .filter((r): r is ParentChildRelationship => r.type === "parent-child" && r.child === personId)
    .map((r) => r.parent)
}

export function getChildren(personId: string, relationships: Relationship[]): string[] {
  return relationships
    .filter((r): r is ParentChildRelationship => r.type === "parent-child" && r.parent === personId)
    .map((r) => r.child)
}

export function getSpouseRelationships(personId: string, relationships: Relationship[]): SpouseRelationship[] {
  return relationships.filter(
    (r): r is SpouseRelationship => r.type === "spouse" && (r.personA === personId || r.personB === personId)
  )
}

export function otherSpouse(rel: SpouseRelationship, personId: string): string {
  return rel.personA === personId ? rel.personB : rel.personA
}

/**
 * Assigns each person a generation row via BFS over parent-child edges (longest path from any root),
 * then aligns spouses who have no blood-line generation of their own (people who married into the
 * tree) to sit alongside their partner instead of collapsing to row 0. Iterates to a fixpoint so
 * chains of in-laws (e.g. an in-law's own in-law) settle together.
 */
export function computeGenerations(data: FamilyTreeData): Record<string, number> {
  const parentChild = data.relationships.filter((r): r is ParentChildRelationship => r.type === "parent-child")
  const spouseRels = data.relationships.filter((r): r is SpouseRelationship => r.type === "spouse")

  const childIds = new Set(parentChild.map((r) => r.child))
  const gen: Record<string, number> = {}
  const roots = data.people.filter((p) => !childIds.has(p.id))
  const queue: { id: string; level: number }[] = roots.map((p) => ({ id: p.id, level: 0 }))
  roots.forEach((p) => (gen[p.id] = 0))

  let i = 0
  while (i < queue.length) {
    const { id, level } = queue[i]
    i++
    parentChild
      .filter((r) => r.parent === id)
      .forEach((r) => {
        const nl = level + 1
        if (gen[r.child] === undefined || nl > gen[r.child]) {
          gen[r.child] = nl
          queue.push({ id: r.child, level: nl })
        }
      })
  }

  data.people.forEach((p) => {
    if (gen[p.id] === undefined) gen[p.id] = 0
  })

  const hasBloodGen = new Set(parentChild.map((r) => r.child))
  let changed = true
  let guard = 0
  while (changed && guard < data.people.length + 5) {
    changed = false
    guard++
    spouseRels.forEach((s) => {
      const aHasBlood = hasBloodGen.has(s.personA)
      const bHasBlood = hasBloodGen.has(s.personB)
      if (!aHasBlood && bHasBlood && gen[s.personA] !== gen[s.personB]) {
        gen[s.personA] = gen[s.personB]
        changed = true
      } else if (!bHasBlood && aHasBlood && gen[s.personB] !== gen[s.personA]) {
        gen[s.personB] = gen[s.personA]
        changed = true
      } else if (!aHasBlood && !bHasBlood && gen[s.personA] !== gen[s.personB]) {
        const target = Math.max(gen[s.personA], gen[s.personB])
        gen[s.personA] = target
        gen[s.personB] = target
        changed = true
      }
    })
  }

  return gen
}

/** Orders a generation row so spouse pairs sit next to each other. */
export function orderWithSpouses(ids: string[], relationships: Relationship[]): string[] {
  const spouseMap = new Map<string, string[]>()
  relationships.forEach((r) => {
    if (r.type !== "spouse") return
    if (!spouseMap.has(r.personA)) spouseMap.set(r.personA, [])
    if (!spouseMap.has(r.personB)) spouseMap.set(r.personB, [])
    spouseMap.get(r.personA)!.push(r.personB)
    spouseMap.get(r.personB)!.push(r.personA)
  })

  const idSet = new Set(ids)
  const placed = new Set<string>()
  const ordered: string[] = []
  ids.forEach((id) => {
    if (placed.has(id)) return
    ordered.push(id)
    placed.add(id)
    const spouseIds = (spouseMap.get(id) || []).filter((sid) => idSet.has(sid) && !placed.has(sid))
    spouseIds.forEach((sid) => {
      ordered.push(sid)
      placed.add(sid)
    })
  })
  return ordered
}

export function formatYears(p: Person): string {
  return `${p.birthYear || "?"} – ${p.deathYear || "?"}`
}
