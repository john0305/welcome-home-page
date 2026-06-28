import { create } from 'zustand'

export interface AchievementAward {
  id: string
  achievement_id: string
  awarded_at: string
  achievements?: {
    id: string
    name: string
    description: string
    flavor_text: string | null
    icon: string
    points: number
    category: string
  } | null
}

interface AchievementQueueStore {
  queue: AchievementAward[]
  current: AchievementAward | null
  enqueueMany: (items: AchievementAward[]) => void
  dismiss: () => void
  clearAll: () => void
}

export const useAchievementQueue = create<AchievementQueueStore>((set, get) => ({
  queue: [],
  current: null,
  enqueueMany: (items) => {
    if (!items.length) return
    set((state) => {
      if (state.current) return { queue: [...state.queue, ...items] }
      const [first, ...rest] = items
      return { current: first, queue: [...state.queue, ...rest] }
    })
  },
  dismiss: () => {
    const { queue } = get()
    set({ current: null })
    if (queue.length === 0) return
    setTimeout(() => {
      const [next, ...rest] = queue
      set({ current: next, queue: rest })
    }, 1000)
  },
  clearAll: () => set({ current: null, queue: [] }),
}))
