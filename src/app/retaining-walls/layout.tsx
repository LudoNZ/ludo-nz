import OfflineSupport from "./offlineSupport"

export default function RetainingWallsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineSupport />
      {children}
    </>
  )
}
