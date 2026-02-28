// Desktop: Auction catalog — Week 2
export default async function AuctionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Auction Catalog</h1>
      <p className="text-sm text-neutral-500">Auction ID: {id}</p>
      {/* Item list + scraper — wired up in Week 2 */}
    </div>
  )
}
