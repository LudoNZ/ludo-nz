import FamilyTreeSessionPage from "./familyTreeSessionPage"

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <FamilyTreeSessionPage code={code} />
}
