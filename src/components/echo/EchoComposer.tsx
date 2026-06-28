import { useRef, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_LEN = 600
const COUNTER_THRESHOLD = 500

interface Props {
  value: string
  onChange: (v: string) => void
  onSend: (text: string) => void
  disabled: boolean
}

export function EchoComposer({ value, onChange, onSend, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!disabled && value.trim()) onSend(value)
    }
  }

  const count = value.length
  const showCounter = count >= COUNTER_THRESHOLD
  const counterColor =
    count >= MAX_LEN ? 'text-destructive'
    : count >= 550   ? 'text-amber-400'
    : 'text-muted-foreground/50'

  const empty = value.trim().length === 0

  return (
    <div className="p-2.5">
      <div className="echo-composer-wrap relative flex items-end gap-2 p-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={handleKeyDown}
          placeholder="Ask Echo about your shop or a specific listing..."
          rows={1}
          maxLength={MAX_LEN}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none min-h-[20px] max-h-[120px] disabled:opacity-50 leading-[1.4]"
        />
        <button
          onClick={() => !empty && onSend(value)}
          disabled={disabled || empty}
          className="echo-send-btn shrink-0 flex h-7 w-7 items-center justify-center"
          aria-label="Send"
        >
          <Send className="h-3.5 w-3.5" />
        </button>

        {showCounter && (
          <span className={cn('absolute bottom-1 right-10 text-[10px] pointer-events-none', counterColor)}>
            {count}/{MAX_LEN}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/35 mt-1 px-1">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  )
}
