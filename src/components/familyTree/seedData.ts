import { FamilyTreeData, Person, Relationship } from "./types"

/** Small placeholder dataset — same shape as the original design mock, kept as a quick way to try the app. */
export function getDemoFamilySeed(): FamilyTreeData {
  const people: Person[] = [
    {
      id: "p1",
      name: "William Smith",
      birthYear: "1920",
      deathYear: "2005",
      confirmed: true,
      sources: [
        { type: "Birth Certificate", year: "1920", location: "London, UK" },
        { type: "1951 Census", year: "1951", location: "London, UK" },
      ],
    },
    {
      id: "p2",
      name: "Mary Johnson",
      birthYear: "1925",
      deathYear: "2010",
      confirmed: true,
      sources: [
        { type: "Birth Certificate", year: "1925", location: "London, UK" },
        { type: "Marriage Certificate", year: "1945", location: "London, UK" },
      ],
    },
    {
      id: "p3",
      name: "Robert Smith",
      birthYear: "1950",
      confirmed: true,
      sources: [{ type: "Birth Certificate", year: "1950", location: "London, UK" }],
    },
    {
      id: "p4",
      name: "Elizabeth Smith",
      birthYear: "1952",
      confirmed: false,
      sources: [
        { type: "Birth Certificate", year: "1952", location: "London, UK" },
        { type: "School Record", year: "1957", location: "London, UK" },
      ],
    },
    {
      id: "p5",
      name: "Margaret Smith",
      birthYear: "1948",
      deathYear: "2015",
      confirmed: true,
      sources: [{ type: "Birth Certificate", year: "1948", location: "London, UK" }],
    },
    {
      id: "p6",
      name: "David Smith",
      birthYear: "1975",
      confirmed: true,
      sources: [{ type: "Birth Certificate", year: "1975", location: "London, UK" }],
    },
    {
      id: "p7",
      name: "Helen Carter",
      birthYear: "1978",
      confirmed: false,
      sources: [],
    },
  ]

  const relationships: Relationship[] = [
    { id: "r1", type: "spouse", personA: "p1", personB: "p2", marriedYear: "1945", location: "London, UK" },
    { id: "r2", type: "parent-child", parent: "p1", child: "p3" },
    { id: "r3", type: "parent-child", parent: "p2", child: "p3" },
    { id: "r4", type: "parent-child", parent: "p1", child: "p4" },
    { id: "r5", type: "parent-child", parent: "p2", child: "p4" },
    { id: "r6", type: "parent-child", parent: "p1", child: "p5" },
    { id: "r7", type: "parent-child", parent: "p2", child: "p5" },
    { id: "r8", type: "spouse", personA: "p3", personB: "p7" },
    { id: "r9", type: "parent-child", parent: "p3", child: "p6" },
  ]

  return { people, relationships }
}
