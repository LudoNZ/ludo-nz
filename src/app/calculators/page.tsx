import { getCalculatorStatuses } from "@/lib/calculatorStatus.server"
import CalculatorsPage from "./calculatorsPage"

export default async function Page() {
  return <CalculatorsPage statuses={await getCalculatorStatuses()} />
}
