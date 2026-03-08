import Image from 'next/image'

export default function DashboardLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <Image
        src="/logo.png"
        alt="Soledgic"
        width={120}
        height={48}
        className="animate-pulse"
        priority
      />
    </div>
  )
}
