// Desktop: Item detail — market price entry, scraper, bid results — Week 2
export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>
}) {
  const { id, itemId } = await params
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Item Detail</h1>
      <p className="text-sm text-neutral-500">Auction: {id} | Item: {itemId}</p>
      {/* Market price entry + bid results — wired up in Week 2 */}
    </div>
  )
}
