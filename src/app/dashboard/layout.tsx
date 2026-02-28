import Link from 'next/link'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 h-14 flex items-center justify-between shrink-0">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          Axiom
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
            Auctions
          </Link>
          <Link href="/settings" className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white">
            Settings
          </Link>
        </nav>
      </header>
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  )
}
