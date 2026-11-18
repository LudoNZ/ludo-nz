import FeatureGate from "@/components/auth/featureGate"

export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="calculators">{children}</FeatureGate>
}
