"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, BarChart2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatsDropdownProps {
  stats: {
    wpm: number
    accuracy: number
    completedTests: number
    totalChars: number
  }
}

export function StatsDropdown({ stats }: StatsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-lg font-semibold mb-2 focus:outline-none"
      >
        <div className="flex items-center">
          <BarChart2 className="h-5 w-5 mr-2" />
          Your Stats
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
      </button>

      <div
        className={cn(
          "grid grid-cols-2 md:grid-cols-4 gap-4 overflow-hidden transition-all duration-300",
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="text-center">
          <div className="text-sm text-slate-500 dark:text-slate-400">Best WPM</div>
          <div className="text-xl font-bold">{stats.wpm || 0}</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-slate-500 dark:text-slate-400">Avg. Accuracy</div>
          <div className="text-xl font-bold">{stats.accuracy || 100}%</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-slate-500 dark:text-slate-400">Tests Completed</div>
          <div className="text-xl font-bold">{stats.completedTests}</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-slate-500 dark:text-slate-400">Total Characters</div>
          <div className="text-xl font-bold">{stats.totalChars}</div>
        </div>
      </div>
    </div>
  )
}
