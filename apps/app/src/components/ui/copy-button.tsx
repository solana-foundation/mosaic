'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  textToCopy: string
  displayText?: string
  className?: string
  iconClassName?: string
  iconClassNameCheck?: string
}

export function CopyButton({
  textToCopy,
  displayText,
  className,
  iconClassName = "h-4 w-4",
  iconClassNameCheck = "h-4 w-4"
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 rounded-lg transition-all duration-150",
        className
      )}
    >
      {displayText && <span className="font-mono">{displayText}</span>}
      {copied ? (
        <Check className={cn("text-green-600 dark:text-green-400", iconClassNameCheck)} />
      ) : (
        <Copy className={cn("text-gray-500 dark:text-gray-400", iconClassName)} />
      )}
    </button>
  )
}
