// Mobile: Auction item list for floor triage — Week 3
// No dashboard chrome — this is a full-screen mobile UI
export default async function TriagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <header className="p-4 border-b border-neutral-800">
        <h1 className="text-lg font-bold">Floor Triage</h1>
      </header>
      <main className="flex-1 p-4">
        <p className="text-sm text-neutral-500">Auction: {id}</p>
        {/* Item list — wired up in Week 3 */}
      </main>
    </div>
  )
}
