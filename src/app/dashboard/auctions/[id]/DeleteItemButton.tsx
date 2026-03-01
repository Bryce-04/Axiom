'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function DeleteItemButton({ itemId, auctionId }: { itemId: string; auctionId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('items').delete().eq('id', itemId)
    router.push(`/dashboard/auctions/${auctionId}`)
    router.refresh()
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-40 transition-colors"
        >
          {deleting ? 'Deleting…' : 'Confirm delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs font-medium text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
    >
      Delete
    </button>
  )
}
