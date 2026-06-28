/**
 * StatTabs — top-row lifecycle tabs for the Listings page.
 * Single-select. Clicking the active tab clears the selection.
 */
import { cn } from '@/lib/utils'

export type StatTabId = 'all' | 'active' | 'never_optimized' | 'low_grade' | 'pending' | 'optimized'

export interface StatTab {
  id: StatTabId
  label: string
  count: number
}

interface StatTabsProps {
  tabs: StatTab[]
  selected: StatTabId
  onSelect: (id: StatTabId) => void
}

export function StatTabs({ tabs, selected, onSelect }: StatTabsProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex items-center gap-2 whitespace-nowrap py-0.5">
        {tabs.map(t => {
          const isActive = selected === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(isActive && t.id !== 'all' ? 'all' : t.id)}
              className={cn(
                'relative flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                isActive
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-border/60 bg-card text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              <span>{t.label}</span>
              <span
                className={cn(
                  'inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded px-1 text-[10px] font-semibold',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {t.count}
              </span>
              {isActive && (
                <span className="absolute -bottom-1 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
