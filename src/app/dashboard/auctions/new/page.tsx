import { createClient } from '@/lib/supabase/server'
import { NewAuctionForm } from './NewAuctionForm'

export default async function NewAuctionPage() {
  const supabase = await createClient()
  const { data: presets } = await supabase
    .from('auction_presets')
    .select('*')
    .order('sort_order')

  return <NewAuctionForm presets={presets ?? []} />
}
