import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

type TabsVariant = 'default' | 'line' | 'loose'

const TabsVariantContext = React.createContext<TabsVariant>('default')

const Tabs = TabsPrimitive.Root

const tabsListVariants = cva(
  'inline-flex items-center',
  {
    variants: {
      variant: {
        /** Pill container — for Settings, NewListing, compact tab sets (2–4 tabs) */
        default: 'h-9 rounded-[var(--radius)] bg-surface-1 p-1 gap-0.5 text-muted-foreground',
        /** Underline tabs — for Intelligence, wide tab sets with many items */
        line:    'h-10 w-full border-b border-border gap-0 rounded-none bg-transparent text-muted-foreground overflow-x-auto',
        /** Spaced pills — for Dashboard swipeable sections */
        loose:   'gap-1.5 rounded-none bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = 'default', ...props }, ref) => (
  <TabsVariantContext.Provider value={variant ?? 'default'}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  </TabsVariantContext.Provider>
))
TabsList.displayName = TabsPrimitive.List.displayName

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'rounded-[calc(var(--radius)-2px)] px-3 py-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        line:    'rounded-none border-b-2 border-transparent px-4 pb-2.5 pt-2 data-[state=active]:border-primary data-[state=active]:text-foreground shrink-0',
        loose:   'rounded-full px-4 py-1.5 border border-border/60 bg-card text-muted-foreground data-[state=active]:bg-primary/15 data-[state=active]:border-primary/35 data-[state=active]:text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
