import DiceSessionPage from "./diceSessionPage"

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <DiceSessionPage code={code} />
}
