import { getCalculatorStatuses } from "@/lib/calculatorStatus.server"
import { AdminDashboardPage } from "./adminDashboardPage"

export default async function Page() {
  return <AdminDashboardPage calculatorStatuses={await getCalculatorStatuses()} />
}
