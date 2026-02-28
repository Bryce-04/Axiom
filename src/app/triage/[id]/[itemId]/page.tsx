// Mobile: Tap condition → giant max bid display — Week 3
// This is the core floor UI. No nav, no clutter.
export default async function TriageItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const { id, itemId } = await params
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Condition selector + bid display — wired up in Week 3 */}
      <p className="p-4 text-sm text-neutral-500">Item: {itemId} | Auction: {id}</p>
    </div>
  )
}
