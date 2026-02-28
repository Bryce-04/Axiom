import { createClient } from '@/lib/supabase/server'
import { ProfitConditionForm, FeeConfigTable } from './SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()

  const [{ data: settingsRows }, { data: feeConfigs }] = await Promise.all([
    supabase.from('settings').select('*'),
    supabase.from('fee_configs').select('*').order('platform_name'),
  ])

  const s = Object.fromEntries(settingsRows?.map(r => [r.key, r.value]) ?? [])

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>

      {/* Profit & Conditions */}
      <section className="mb-10">
        <h2 className="text-base font-semibold mb-1">Profit Target & Condition Defaults</h2>
        <p className="text-sm text-neutral-500 mb-5">
          These values feed directly into the bid formula across all auctions.
          Changes take effect on every bid calculation instantly — no migration needed.
        </p>
        <ProfitConditionForm
          desiredProfit={s.desired_profit ?? '50'}
          nibPct={s.nib_pct             ?? '1.00'}
          excellentPct={s.excellent_pct ?? '0.80'}
          fairPct={s.fair_pct           ?? '0.55'}
          poorPct={s.poor_pct           ?? '0.30'}
        />
      </section>

      <hr className="border-neutral-200 dark:border-neutral-800 mb-10" />

      {/* Fee configs */}
      <section>
        <h2 className="text-base font-semibold mb-1">Resale Platforms</h2>
        <p className="text-sm text-neutral-500 mb-5">
          The default platform is used for any item that does not have a platform
          explicitly assigned. Fee % and shipping are deducted from resale value
          before calculating your max bid.
        </p>
        <FeeConfigTable initial={feeConfigs ?? []} />
      </section>
    </div>
  )
}
