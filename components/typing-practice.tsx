"use client"

import React from "react"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { wordLists } from "@/data/word-lists"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Settings,
  RefreshCw,
  BarChart2,
  Clock,
  Zap,
  Volume2,
  VolumeX,
  Users,
  Share2,
  Trophy,
  Hash,
  ShieldCheck,
  ShieldOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { cn } from "@/lib/utils"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useToast } from "@/components/ui/use-toast"

type TypingMode = "time" | "words"
type TypingDifficulty = "easy" | "medium" | "hard" | "numbers" | "mixed"
type AccuracyMode = "strict" | "relaxed"

interface TypingStats {
  wpm: number
  accuracy: number
  correctChars: number
  incorrectChars: number
  totalChars: number
  completedTests: number
}

interface TypingSettings {
  mode: TypingMode
  difficulty: TypingDifficulty
  timeLimit: number
  wordCount: number
  soundEnabled: boolean
  accuracyMode: AccuracyMode
}

interface Challenge {
  id: string
  creatorName: string
  difficulty: TypingDifficulty
  mode: TypingMode
  limit: number
  expiresAt: number
  bestWpm: number
  bestAccuracy: number
  participants: {
    name: string
    wpm: number
    accuracy: number
  }[]
}

interface Room {
  id: string
  name: string
  creatorName: string
  difficulty: TypingDifficulty
  mode: TypingMode
  limit: number
  participants: {
    id: string
    name: string
    progress: number
    wpm: number
    accuracy: number
    isActive: boolean
  }[]
}

const DEFAULT_SETTINGS: TypingSettings = {
  mode: "time",
  difficulty: "medium",
  timeLimit: 30,
  wordCount: 25,
  soundEnabled: true,
  accuracyMode: "relaxed",
}

const DEFAULT_STATS: TypingStats = {
  wpm: 0,
  accuracy: 0,
  correctChars: 0,
  incorrectChars: 0,
  totalChars: 0,
  completedTests: 0,
}

// Memoized component for rendering a word
const WordDisplay = React.memo(
  ({
    word,
    isCurrentWord,
    wordIndex,
    currentWordIndex,
    currentCharIndex,
    correctChars,
    charOffset,
  }: {
    word: string
    isCurrentWord: boolean
    wordIndex: number
    currentWordIndex: number
    currentCharIndex: number
    correctChars: boolean[]
    charOffset: number
  }) => {
    const chars = []
    let offset = charOffset

    for (let i = 0; i < word.length; i++) {
      const char = word[i]
      const isCurrentChar = isCurrentWord && i === currentCharIndex
      const hasBeenTyped = wordIndex < currentWordIndex || (isCurrentWord && i < currentCharIndex)

      chars.push(
        <span
          key={`char-${wordIndex}-${i}`}
          className={cn(
            hasBeenTyped && correctChars[offset] && "text-emerald-500 dark:text-emerald-400",
            hasBeenTyped && !correctChars[offset] && "text-red-500 dark:text-red-400 border-b border-red-500",
            isCurrentChar && "bg-teal-200 dark:bg-teal-800 rounded",
          )}
        >
          {char}
        </span>,
      )
      offset++
    }

    return (
      <span
        className={cn(
          "px-1 py-0.5 rounded whitespace-nowrap",
          isCurrentWord && "bg-slate-100 dark:bg-slate-700 font-medium",
        )}
      >
        {chars}
      </span>
    )
  },
)

WordDisplay.displayName = "WordDisplay"

export default function TypingPractice() {
  // State for typing test
  const [settings, setSettings] = useLocalStorage<TypingSettings>("typing-settings", DEFAULT_SETTINGS)
  const [stats, setStats] = useLocalStorage<TypingStats>("typing-stats", DEFAULT_STATS)
  const [words, setWords] = useState<string[]>([])
  const [currentInput, setCurrentInput] = useState("")
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [currentCharIndex, setCurrentCharIndex] = useState(0)
  const [correctChars, setCorrectChars] = useState<boolean[]>([])
  const [startTime, setStartTime] = useState(0)
  const [timeElapsed, setTimeElapsed] = useState(0)
  const [testActive, setTestActive] = useState(false)
  const [testComplete, setTestComplete] = useState(false)
  const [currentWpm, setCurrentWpm] = useState(0)
  const [currentAccuracy, setCurrentAccuracy] = useState(100)
  const [userName, setUserName] = useLocalStorage<string>("typing-username", "")
  const [challenges, setChallenges] = useLocalStorage<Challenge[]>("typing-challenges", [])
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null)
  const [rooms, setRooms] = useLocalStorage<Room[]>("typing-rooms", [])
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)
  const [newChallengeName, setNewChallengeName] = useState("")
  const [newRoomName, setNewRoomName] = useState("")
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [activeTab, setActiveTab] = useState<"practice" | "challenge" | "room">("practice")
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 15 })
  const [statsOpen, setStatsOpen] = useState(false)
  const [errorPosition, setErrorPosition] = useState<number | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const correctSound = useRef<HTMLAudioElement | null>(null)
  const errorSound = useRef<HTMLAudioElement | null>(null)
  const finishSound = useRef<HTMLAudioElement | null>(null)
  const textContainerRef = useRef<HTMLDivElement>(null)
  const shouldUpdateVisibleRange = useRef(false)
  const { toast } = useToast()

  // Initialize audio elements
  useEffect(() => {
    correctSound.current = new Audio("/sounds/correct.mp3")
    errorSound.current = new Audio("/sounds/error.mp3")
    finishSound.current = new Audio("/sounds/finish.mp3")

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Auto-focus input field on mount and after reset
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [testActive, testComplete])

  // Check if we need to prompt for a username
  useEffect(() => {
    if (!userName && (activeTab === "challenge" || activeTab === "room")) {
      setShowNamePrompt(true)
    }
  }, [activeTab, userName])

  // Generate random words based on difficulty
  const generateWords = useCallback(() => {
    const difficultyMap = {
      easy: wordLists.easy,
      medium: wordLists.medium,
      hard: wordLists.hard,
      numbers: wordLists.numbers,
      mixed: wordLists.mixed,
    }

    const wordPool = difficultyMap[settings.difficulty]
    const shuffled = [...wordPool].sort(() => 0.5 - Math.random())

    // Get word count based on mode
    // For time mode, generate more words to ensure we don't run out
    const count = settings.mode === "words" ? settings.wordCount : Math.min(300, wordPool.length)
    return shuffled.slice(0, count)
  }, [settings.difficulty, settings.mode, settings.wordCount])

  // Calculate character offsets for each word - memoized to prevent recalculation
  const charOffsets = useMemo(() => {
    const offsets = [0]
    let totalOffset = 0

    for (let i = 0; i < words.length - 1; i++) {
      totalOffset += words[i].length + 1 // +1 for space
      offsets.push(totalOffset)
    }

    return offsets
  }, [words])

  // Initialize or reset the test
  const resetTest = useCallback(() => {
    const newWords = generateWords()
    setWords(newWords)
    setCurrentInput("")
    setCurrentWordIndex(0)
    setCurrentCharIndex(0)
    setVisibleRange({ start: 0, end: 15 })
    setErrorPosition(null)

    // Initialize correctChars array with falses for each character in the entire text
    const totalChars = newWords.join(" ").length
    setCorrectChars(Array(totalChars).fill(false))

    setStartTime(0)
    setTimeElapsed(0)
    setTestActive(false)
    setTestComplete(false)
    setCurrentWpm(0)
    setCurrentAccuracy(100)

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    // Enable visible range updates after reset
    shouldUpdateVisibleRange.current = true

    // Focus the input field
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
      }
    }, 0)
  }, [generateWords])

  // Initialize test on component mount or when settings change
  useEffect(() => {
    resetTest()
  }, [resetTest, settings.difficulty, settings.mode])

  // Separate effect for wordCount and timeLimit changes
  useEffect(() => {
    if (testActive || testComplete) return // Don't reset if test is in progress
    resetTest()
  }, [settings.wordCount, settings.timeLimit, testActive, testComplete, resetTest])

  // Update visible range when current word changes
  useEffect(() => {
    // Only update if we should (prevents infinite loops)
    if (!shouldUpdateVisibleRange.current) return

    // Adjust the visible range to keep the current word in view
    // and show approximately 3-4 lines (about 15 words)
    if (currentWordIndex > visibleRange.end - 5) {
      setVisibleRange({
        start: Math.max(0, currentWordIndex - 3),
        end: Math.min(words.length, currentWordIndex + 12),
      })
    } else if (currentWordIndex < visibleRange.start + 3 && currentWordIndex > 3) {
      setVisibleRange({
        start: Math.max(0, currentWordIndex - 3),
        end: Math.min(words.length, currentWordIndex + 12),
      })
    }
  }, [currentWordIndex, visibleRange, words.length])

  // Get the character count of completed text
  const getCompletedCharCount = useCallback(() => {
    if (currentWordIndex === 0 && currentCharIndex === 0) {
      return 0
    }
    if (charOffsets.length === 0 || currentWordIndex >= charOffsets.length) {
      return 0
    }
    return charOffsets[currentWordIndex] + currentCharIndex
  }, [currentWordIndex, currentCharIndex, charOffsets])

  // Get the total number of correct characters typed
  const getCorrectCharCount = useCallback(() => {
    return correctChars.filter(Boolean).length
  }, [correctChars])

  // Memoize accuracy calculation to prevent unnecessary re-renders
  const calculateCurrentAccuracy = useCallback(() => {
    const totalChars = getCompletedCharCount()
    if (totalChars === 0) return 100
    const correctCount = getCorrectCharCount()
    return Math.round((correctCount / totalChars) * 100)
  }, [getCompletedCharCount, getCorrectCharCount])

  // Start the timer when test becomes active
  useEffect(() => {
    if (testActive && !testComplete) {
      timerRef.current = setInterval(() => {
        const currentTime = Date.now()
        const elapsed = (currentTime - startTime) / 1000
        setTimeElapsed(elapsed)

        // Calculate current WPM
        const charsTyped = getCompletedCharCount()
        const wordsTyped = charsTyped / 5 // Standard: 5 chars = 1 word
        const minutesElapsed = elapsed / 60
        if (minutesElapsed > 0) {
          const wpm = Math.round(wordsTyped / minutesElapsed)
          setCurrentWpm(wpm)
        }

        // Check if time limit reached in time mode
        if (settings.mode === "time" && elapsed >= settings.timeLimit) {
          endTest()
        }

        // End test if all words are typed in time mode
        if (settings.mode === "time" && currentWordIndex >= words.length) {
          endTest()
        }
      }, 100)

      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }
  }, [
    testActive,
    startTime,
    testComplete,
    settings.mode,
    settings.timeLimit,
    getCompletedCharCount,
    currentWordIndex,
    words.length,
  ])

  // Calculate the current accuracy
  const calculateAccuracy = useCallback(() => {
    const totalChars = getCompletedCharCount()
    if (totalChars === 0) return 100
    const correctCount = getCorrectCharCount()
    return Math.round((correctCount / totalChars) * 100)
  }, [getCompletedCharCount, getCorrectCharCount])

  // Handle input changes with debounce for better performance
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value

    // Don't do anything if the test is complete
    if (testComplete) return

    // Start the test on first input if not already started
    if (!testActive && value.length > 0) {
      setTestActive(true)
      setStartTime(Date.now())
    }

    // Get the current word
    const currentWord = words[currentWordIndex]
    if (!currentWord) return // Safety check

    // Key press handling
    if (value.length > currentInput.length) {
      // User typed a character
      const typedChar = value[value.length - 1]
      // Regular character typing (not space)
      const expectedChar = currentWord[currentCharIndex]
      const isCorrect = typedChar === expectedChar

      // Play sound if enabled
      if (settings.soundEnabled) {
        if (isCorrect) {
          correctSound.current?.play().catch(() => {})
        } else {
          errorSound.current?.play().catch(() => {})
        }
      }

      // Update correctChars array
      if (charOffsets[currentWordIndex] !== undefined && currentCharIndex < currentWord.length) {
        const charPosition = charOffsets[currentWordIndex] + currentCharIndex
        const newCorrectChars = [...correctChars]
        newCorrectChars[charPosition] = isCorrect
        setCorrectChars(newCorrectChars)
      }

      // Update accuracy
      setCurrentAccuracy(calculateCurrentAccuracy())

      // In strict mode, only increment character index if correct
      // In relaxed mode, always increment
      if (settings.accuracyMode === "strict") {
        if (isCorrect) {
          setCurrentCharIndex(currentCharIndex + 1)
        }
        setCurrentInput(value)
      } else {
        setCurrentCharIndex(currentCharIndex + 1)
        setCurrentInput(value)
      }

      // Check if it's a space
      if (typedChar === " ") {
        // In strict mode, don't allow proceeding if there's an error
        if (settings.accuracyMode === "strict" && errorPosition !== null) {
          return // Don't proceed if there's an error in strict mode
        }

        // Only proceed if we've typed all the characters of the current word
        // or if we're in relaxed mode
        if (currentCharIndex === currentWord.length || settings.accuracyMode === "relaxed") {
          // Move to next word
          const newIndex = currentWordIndex + 1

          // Temporarily disable visible range updates to prevent infinite loops
          shouldUpdateVisibleRange.current = false
          setCurrentWordIndex(newIndex)
          setCurrentCharIndex(0)
          setCurrentInput("")
          setErrorPosition(null)
          // Re-enable visible range updates after state updates
          setTimeout(() => {
            shouldUpdateVisibleRange.current = true
          }, 0)

          // Check if we've completed all words
          if (newIndex >= words.length) {
            // End the test if we've typed all words, even in time mode
            endTest()
            return
          }

          // Check if we've completed the test in words mode
          if (settings.mode === "words" && newIndex >= settings.wordCount) {
            endTest()
            return
          }

          // Play sound if enabled
          if (settings.soundEnabled) {
            correctSound.current?.play().catch(() => {})
          }

          return
        } else if (settings.accuracyMode === "strict") {
          // In strict mode, don't allow proceeding to next word until current word is correct
          // Just ignore the space
          return
        }
      }
    } else if (value.length < currentInput.length) {
      // Backspace handling
      // In both strict and relaxed modes, we allow backspacing

      // If we're at the start of a word and backspacing, go to the previous word
      if (currentCharIndex === 0 && currentWordIndex > 0) {
        const prevWord = words[currentWordIndex - 1]
        if (!prevWord) return // Safety check

        // Temporarily disable visible range updates to prevent infinite loops
        shouldUpdateVisibleRange.current = false
        setCurrentWordIndex(currentWordIndex - 1)
        setCurrentCharIndex(prevWord.length)
        setCurrentInput(prevWord)
        // Re-enable visible range updates after state updates
        setTimeout(() => {
          shouldUpdateVisibleRange.current = true
        }, 0)
      } else if (currentCharIndex > 0) {
        // Regular backspace within a word
        setCurrentCharIndex(currentCharIndex - 1)
        setCurrentInput(value)

        // Update correctChars array (remove the mark for the deleted character)
        if (charOffsets[currentWordIndex] !== undefined) {
          const charPosition = charOffsets[currentWordIndex] + currentCharIndex - 1
          if (charPosition >= 0 && charPosition < correctChars.length) {
            const newCorrectChars = [...correctChars]
            newCorrectChars[charPosition] = false
            setCorrectChars(newCorrectChars)
          }
        }

        // In strict mode, if we're backspacing to or before the error position, clear it
        if (settings.accuracyMode === "strict" && errorPosition !== null && currentCharIndex - 1 <= errorPosition) {
          setErrorPosition(null)
        }

        // Update accuracy
        setCurrentAccuracy(calculateCurrentAccuracy())
      }
    }
  }

  // End the test and calculate results
  const endTest = () => {
    if (timerRef.current) clearInterval(timerRef.current)

    setTestActive(false)
    setTestComplete(true)

    // Play finish sound if enabled
    if (settings.soundEnabled) {
      finishSound.current?.play().catch(() => {})
    }

    // Calculate final stats
    const minutes = timeElapsed / 60
    const charsTyped = getCompletedCharCount()
    const wordsTyped = charsTyped / 5 // Standard: 5 chars = 1 word
    const wpm = Math.round(wordsTyped / minutes) || 0
    const accuracy = calculateAccuracy()

    // Update stats
    const totalCorrectChars = getCorrectCharCount()
    const totalIncorrectChars = charsTyped - totalCorrectChars

    const newStats = {
      wpm: Math.max(stats.wpm, wpm),
      accuracy: Math.round((stats.accuracy + accuracy) / 2),
      correctChars: stats.correctChars + totalCorrectChars,
      incorrectChars: stats.incorrectChars + totalIncorrectChars,
      totalChars: stats.totalChars + charsTyped,
      completedTests: stats.completedTests + 1,
    }

    setStats(newStats)

    // If this is for a challenge, update the challenge
    if (activeChallengeId) {
      updateChallengeResult(activeChallengeId, wpm, accuracy)
    }

    // If this is for a room, update the room participants
    if (activeRoomId) {
      updateRoomResult(activeRoomId, wpm, accuracy, 100)
    }
  }

  // Create a new challenge
  const createChallenge = () => {
    if (!userName) {
      setShowNamePrompt(true)
      return
    }

    const newChallenge: Challenge = {
      id: Date.now().toString(),
      creatorName: userName,
      difficulty: settings.difficulty,
      mode: settings.mode,
      limit: settings.mode === "time" ? settings.timeLimit : settings.wordCount,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24, // Expires in 24 hours
      bestWpm: 0,
      bestAccuracy: 0,
      participants: [],
    }

    setChallenges([...challenges, newChallenge])
    setActiveChallengeId(newChallenge.id)
    resetTest()
  }

  // Update challenge result
  const updateChallengeResult = (challengeId: string, wpm: number, accuracy: number) => {
    setChallenges(
      challenges.map((challenge) => {
        if (challenge.id === challengeId) {
          const updatedParticipants = [...challenge.participants]
          const existingUserIndex = updatedParticipants.findIndex((p) => p.name === userName)

          if (existingUserIndex >= 0) {
            // Update existing participant if their score is better
            if (updatedParticipants[existingUserIndex].wpm < wpm) {
              updatedParticipants[existingUserIndex].wpm = wpm
              updatedParticipants[existingUserIndex].accuracy = accuracy
            }
          } else {
            // Add new participant
            updatedParticipants.push({
              name: userName,
              wpm,
              accuracy,
            })
          }

          // Update best scores
          const bestWpm = Math.max(challenge.bestWpm, wpm)
          const bestAccuracy = Math.max(challenge.bestAccuracy, accuracy)

          return {
            ...challenge,
            participants: updatedParticipants,
            bestWpm,
            bestAccuracy,
          }
        }
        return challenge
      }),
    )
  }

  // Create a new typing room
  const createRoom = () => {
    if (!userName) {
      setShowNamePrompt(true)
      return
    }

    const newRoom: Room = {
      id: Date.now().toString(),
      name: newRoomName || `${userName}'s Room`,
      creatorName: userName,
      difficulty: settings.difficulty,
      mode: settings.mode,
      limit: settings.mode === "time" ? settings.timeLimit : settings.wordCount,
      participants: [
        {
          id: Date.now().toString(),
          name: userName,
          progress: 0,
          wpm: 0,
          accuracy: 0,
          isActive: true,
        },
      ],
    }

    setRooms([...rooms, newRoom])
    setActiveRoomId(newRoom.id)
    resetTest()
  }

  // Join an existing room
  const joinRoom = (roomId: string) => {
    if (!userName) {
      setShowNamePrompt(true)
      return
    }

    setRooms(
      rooms.map((room) => {
        if (room.id === roomId) {
          const existingUserIndex = room.participants.findIndex((p) => p.name === userName)

          if (existingUserIndex >= 0) {
            // Update existing participant
            const updatedParticipants = [...room.participants]
            updatedParticipants[existingUserIndex] = {
              ...updatedParticipants[existingUserIndex],
              isActive: true,
            }

            return {
              ...room,
              participants: updatedParticipants,
            }
          } else {
            // Add new participant
            return {
              ...room,
              participants: [
                ...room.participants,
                {
                  id: Date.now().toString(),
                  name: userName,
                  progress: 0,
                  wpm: 0,
                  accuracy: 0,
                  isActive: true,
                },
              ],
            }
          }
        }
        return room
      }),
    )

    setActiveRoomId(roomId)
    resetTest()
  }

  // Update room results
  const updateRoomResult = (roomId: string, wpm: number, accuracy: number, progress: number) => {
    setRooms(
      rooms.map((room) => {
        if (room.id === roomId) {
          return {
            ...room,
            participants: room.participants.map((participant) => {
              if (participant.name === userName) {
                return {
                  ...participant,
                  wpm,
                  accuracy,
                  progress,
                }
              }
              return participant
            }),
          }
        }
        return room
      }),
    )
  }

  // Get shareable link for challenge with clipboard feedback
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // You could add a toast notification here
      alert("Link copied to clipboard!")
    } catch (err) {
      console.error("Failed to copy: ", err)
    }
  }

  // Get shareable link for challenge
  const getChallengeLink = (challengeId: string) => {
    return `${window.location.origin}?challenge=${challengeId}`
  }

  // Get shareable link for room
  const getRoomLink = (roomId: string) => {
    return `${window.location.origin}?room=${roomId}`
  }

  // Focus input when clicking on the test area
  const focusInput = () => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  // Update settings
  const updateSettings = (newSettings: Partial<TypingSettings>) => {
    setSettings({ ...settings, ...newSettings })
  }

  // Save username
  const saveUsername = (name: string) => {
    setUserName(name)
    setShowNamePrompt(false)
  }

  // Render the text content with optimized performance
  const renderTextContent = useMemo(() => {
    if (!words.length) return null

    // Only render the visible range of words
    const visibleWords = words.slice(visibleRange.start, visibleRange.end)

    return (
      <div className="flex flex-wrap gap-1 font-mono text-2xl font-medium">
        {visibleWords.map((word, index) => {
          const wordIndex = index + visibleRange.start
          const isCurrentWord = wordIndex === currentWordIndex

          return (
            <WordDisplay
              key={`word-${wordIndex}`}
              word={word}
              isCurrentWord={isCurrentWord}
              wordIndex={wordIndex}
              currentWordIndex={currentWordIndex}
              currentCharIndex={currentCharIndex}
              correctChars={correctChars}
              charOffset={charOffsets[wordIndex] || 0}
            />
          )
        })}
      </div>
    )
  }, [words, visibleRange, currentWordIndex, currentCharIndex, correctChars, charOffsets])

  // Render
  return (
    <Card className="w-full max-w-4xl shadow-lg bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="bg-white dark:bg-slate-800">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Typing Test Settings</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Test Mode</Label>
                    <Tabs
                      defaultValue={settings.mode}
                      onValueChange={(value) => updateSettings({ mode: value as TypingMode })}
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="time">
                          <Clock className="h-4 w-4 mr-2" />
                          Time
                        </TabsTrigger>
                        <TabsTrigger value="words">
                          <Zap className="h-4 w-4 mr-2" />
                          Words
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="grid gap-2">
                    <Label>Difficulty</Label>
                    <Tabs
                      defaultValue={settings.difficulty}
                      onValueChange={(value) => updateSettings({ difficulty: value as TypingDifficulty })}
                    >
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="easy">Easy</TabsTrigger>
                        <TabsTrigger value="medium">Medium</TabsTrigger>
                        <TabsTrigger value="hard">Hard</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="grid gap-2">
                    <Label>Content Type</Label>
                    <Tabs
                      defaultValue={settings.difficulty}
                      onValueChange={(value) => updateSettings({ difficulty: value as TypingDifficulty })}
                    >
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="medium">Words</TabsTrigger>
                        <TabsTrigger value="numbers">
                          <Hash className="h-4 w-4 mr-1" />
                          Numbers
                        </TabsTrigger>
                        <TabsTrigger value="mixed">Mixed</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="grid gap-2">
                    <Label>Accuracy Mode</Label>
                    <Tabs
                      defaultValue={settings.accuracyMode}
                      onValueChange={(value) => updateSettings({ accuracyMode: value as AccuracyMode })}
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="strict">
                          <ShieldCheck className="h-4 w-4 mr-1" />
                          Strict
                        </TabsTrigger>
                        <TabsTrigger value="relaxed">
                          <ShieldOff className="h-4 w-4 mr-1" />
                          Relaxed
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <p className="text-xs text-muted-foreground">
                      Strict: Must correct errors before continuing. Relaxed: Can continue with errors.
                    </p>
                  </div>

                  {settings.mode === "time" && (
                    <div className="grid gap-2">
                      <div className="flex justify-between">
                        <Label>Time Limit: {settings.timeLimit} seconds</Label>
                      </div>
                      <Slider
                        defaultValue={[settings.timeLimit]}
                        min={15}
                        max={120}
                        step={15}
                        onValueChange={(value) => updateSettings({ timeLimit: value[0] })}
                      />
                    </div>
                  )}

                  {settings.mode === "words" && (
                    <div className="grid gap-2">
                      <div className="flex justify-between">
                        <Label>Word Count: {settings.wordCount} words</Label>
                      </div>
                      <Slider
                        defaultValue={[settings.wordCount]}
                        min={10}
                        max={100}
                        step={5}
                        onValueChange={(value) => updateSettings({ wordCount: value[0] })}
                      />
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="sound-mode"
                      checked={settings.soundEnabled}
                      onCheckedChange={(checked) => updateSettings({ soundEnabled: checked })}
                    />
                    <Label htmlFor="sound-mode" className="flex items-center">
                      {settings.soundEnabled ? (
                        <>
                          <Volume2 className="h-4 w-4 mr-2" /> Sound Effects
                        </>
                      ) : (
                        <>
                          <VolumeX className="h-4 w-4 mr-2" /> Sound Effects
                        </>
                      )}
                    </Label>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" className="bg-white dark:bg-slate-800" onClick={resetTest}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>

          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-sm text-slate-500 dark:text-slate-400">WPM</div>
              <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                {testActive ? currentWpm : stats.wpm || 0}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-slate-500 dark:text-slate-400">Accuracy</div>
              <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                {testActive ? currentAccuracy : stats.accuracy || 100}%
              </div>
            </div>
            {settings.mode === "time" && (
              <div className="text-center">
                <div className="text-sm text-slate-500 dark:text-slate-400">Time</div>
                <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                  {testActive ? Math.max(0, Math.ceil(settings.timeLimit - timeElapsed)) : settings.timeLimit}s
                </div>
              </div>
            )}
            {settings.mode === "words" && (
              <div className="text-center">
                <div className="text-sm text-slate-500 dark:text-slate-400">Words</div>
                <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                  {currentWordIndex}/{settings.wordCount}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mode Tabs */}
        <Tabs className="mb-4" defaultValue="practice" onValueChange={(value) => setActiveTab(value as any)}>
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="practice">Practice</TabsTrigger>
            <TabsTrigger value="challenge">
              <Trophy className="h-4 w-4 mr-2" />
              Challenges
            </TabsTrigger>
            <TabsTrigger value="room">
              <Users className="h-4 w-4 mr-2" />
              Rooms
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "practice" && (
          <>
            {testComplete ? (
              <div className="text-center py-10">
                <h2 className="text-2xl font-bold mb-4">Test Complete!</h2>
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-6">
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm">
                    <div className="text-sm text-slate-500 dark:text-slate-400">WPM</div>
                    <div className="text-3xl font-bold text-teal-600 dark:text-teal-400">{currentWpm}</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm">
                    <div className="text-sm text-slate-500 dark:text-slate-400">Accuracy</div>
                    <div className="text-3xl font-bold text-teal-600 dark:text-teal-400">{currentAccuracy}%</div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm">
                    <div className="text-sm text-slate-500 dark:text-slate-400">Time</div>
                    <div className="text-3xl font-bold text-teal-600 dark:text-teal-400">
                      {Math.round(timeElapsed)}s
                    </div>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm">
                    <div className="text-sm text-slate-500 dark:text-slate-400">Words</div>
                    <div className="text-3xl font-bold text-teal-600 dark:text-teal-400">{currentWordIndex}</div>
                  </div>
                </div>
                <Button onClick={resetTest} className="bg-teal-600 hover:bg-teal-700">
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 p-6 rounded-lg cursor-text shadow-sm" onClick={focusInput}>
                <div ref={textContainerRef} className="min-h-[120px] max-h-[120px] overflow-hidden mb-4 p-2">
                  <div className="flex flex-wrap gap-1 font-mono text-2xl font-medium">{renderTextContent}</div>
                </div>

                <input
                  ref={inputRef}
                  type="text"
                  value={currentInput}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  placeholder={testActive ? "" : "Type to start..."}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />

                <div className="mt-4 text-sm text-slate-500 dark:text-slate-400 text-center">
                  {!testActive && !testComplete && "Press any key to start typing"}
                  {testActive && settings.accuracyMode === "strict" && "Mode: Must correct errors before continuing"}
                  {testActive && settings.accuracyMode === "relaxed" && "Mode: Can continue with errors"}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "challenge" && (
          <div>
            {showNamePrompt ? (
              <div className="text-center py-8">
                <h2 className="text-xl font-bold mb-4">Enter Your Name</h2>
                <div className="max-w-xs mx-auto">
                  <Input
                    type="text"
                    placeholder="Your name"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="mb-4"
                  />
                  <Button onClick={() => saveUsername(userName)} disabled={!userName.trim()}>
                    Save Name
                  </Button>
                </div>
              </div>
            ) : activeChallengeId ? (
              <div>
                {/* Active Challenge UI */}
                {testComplete ? (
                  <div className="text-center py-8">
                    <h2 className="text-2xl font-bold mb-4">Challenge Complete!</h2>
                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-6">
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm">
                        <div className="text-sm text-slate-500 dark:text-slate-400">WPM</div>
                        <div className="text-3xl font-bold text-teal-600 dark:text-teal-400">{currentWpm}</div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm">
                        <div className="text-sm text-slate-500 dark:text-slate-400">Accuracy</div>
                        <div className="text-3xl font-bold text-teal-600 dark:text-teal-400">{currentAccuracy}%</div>
                      </div>
                    </div>
                    <div className="flex gap-4 justify-center">
                      <Button onClick={resetTest} className="bg-teal-600 hover:bg-teal-700">
                        Try Again
                      </Button>
                      <Button variant="outline" onClick={() => setActiveChallengeId(null)}>
                        Back to Challenges
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold">
                        Challenge by {challenges.find((c) => c.id === activeChallengeId)?.creatorName}
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(getChallengeLink(activeChallengeId))}
                        className="bg-white dark:bg-slate-800"
                      >
                        <Share2 className="h-4 w-4 mr-2" />
                        Share
                      </Button>
                    </div>

                    <div
                      className="bg-white dark:bg-slate-800 p-6 rounded-lg cursor-text shadow-sm"
                      onClick={focusInput}
                    >
                      <div className="min-h-[140px] max-h-[140px] overflow-hidden mb-4 p-2">{renderTextContent}</div>

                      <input
                        ref={inputRef}
                        type="text"
                        value={currentInput}
                        onChange={handleInputChange}
                        className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                        placeholder="Type to start the challenge..."
                        autoFocus
                        autoComplete="off"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck="false"
                      />
                    </div>

                    <div className="mt-6">
                      <h4 className="text-md font-semibold mb-3">Challenge Leaderboard</h4>
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                        {challenges.find((c) => c.id === activeChallengeId)?.participants.length ? (
                          <div className="divide-y divide-slate-200 dark:divide-slate-700">
                            {challenges
                              .find((c) => c.id === activeChallengeId)
                              ?.participants.sort((a, b) => b.wpm - a.wpm)
                              .map((participant, i) => (
                                <div key={i} className="flex justify-between items-center py-2">
                                  <div className="flex items-center">
                                    <span className="font-medium">
                                      {i + 1}. {participant.name}
                                    </span>
                                    {participant.name === userName && (
                                      <span className="ml-2 text-xs bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 px-2 py-0.5 rounded-full">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-4">
                                    <span className="text-sm">{participant.wpm} WPM</span>
                                    <span className="text-sm">{participant.accuracy}% Accuracy</span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <p className="text-sm text-center text-slate-500 py-2">No attempts yet. Be the first!</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {/* Challenge List */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold">Typing Challenges</h3>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-teal-600 hover:bg-teal-700">
                        Create Challenge
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Challenge</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div>
                          <Label htmlFor="challenge-name">Your Name</Label>
                          <Input
                            id="challenge-name"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          The challenge will use your current settings for difficulty, mode, and time/word limit.
                        </p>
                      </div>
                      <Button
                        onClick={createChallenge}
                        disabled={!userName.trim()}
                        className="bg-teal-600 hover:bg-teal-700"
                      >
                        Create Challenge
                      </Button>
                    </DialogContent>
                  </Dialog>
                </div>

                {challenges.length > 0 ? (
                  <div className="space-y-3">
                    {challenges.map((challenge) => (
                      <div key={challenge.id} className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold">{challenge.creatorName}'s Challenge</h4>
                          <div className="text-xs text-slate-500">
                            {new Date(challenge.expiresAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-sm mb-3">
                          <div>
                            <span className="mr-3">{challenge.difficulty} difficulty</span>
                            <span>
                              {challenge.mode === "time" ? `${challenge.limit}s` : `${challenge.limit} words`}
                            </span>
                          </div>
                          <div>
                            <span className="mr-3">{challenge.participants.length} participants</span>
                            <span>Best: {challenge.bestWpm} WPM</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => setActiveChallengeId(challenge.id)}
                            className="bg-teal-600 hover:bg-teal-700"
                          >
                            Accept Challenge
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(getChallengeLink(challenge.id))}
                            className="bg-white dark:bg-slate-800"
                          >
                            <Share2 className="h-4 w-4 mr-1" />
                            Share
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-6 text-center shadow-sm">
                    <p className="text-slate-600 dark:text-slate-400 mb-4">
                      No challenges available. Create your first challenge to compete with friends!
                    </p>
                    <Button
                      onClick={createChallenge}
                      disabled={!userName.trim()}
                      className="bg-teal-600 hover:bg-teal-700"
                    >
                      Create Challenge
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "room" && (
          <div>
            {showNamePrompt ? (
              <div className="text-center py-8">
                <h2 className="text-xl font-bold mb-4">Enter Your Name</h2>
                <div className="max-w-xs mx-auto">
                  <Input
                    type="text"
                    placeholder="Your name"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="mb-4"
                  />
                  <Button
                    onClick={() => saveUsername(userName)}
                    disabled={!userName.trim()}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    Save Name
                  </Button>
                </div>
              </div>
            ) : activeRoomId ? (
              <div>
                {/* Active Room UI */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold">{rooms.find((r) => r.id === activeRoomId)?.name}</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(getRoomLink(activeRoomId))}
                      className="bg-white dark:bg-slate-800"
                    >
                      <Share2 className="h-4 w-4 mr-1" />
                      Invite
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveRoomId(null)}
                      className="bg-white dark:bg-slate-800"
                    >
                      Leave Room
                    </Button>
                  </div>
                </div>

                <div
                  className="bg-white dark:bg-slate-800 p-6 rounded-lg cursor-text mb-4 shadow-sm"
                  onClick={focusInput}
                >
                  <div className="min-h-[140px] max-h-[140px] overflow-hidden mb-4 p-2">{renderTextContent}</div>

                  <input
                    ref={inputRef}
                    type="text"
                    value={currentInput}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                    placeholder="Type to start..."
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                </div>

                <div>
                  <h4 className="text-md font-semibold mb-3">Room Participants</h4>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                    {rooms
                      .find((r) => r.id === activeRoomId)
                      ?.participants.map((participant, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-2 border-b last:border-0 border-slate-200 dark:border-slate-700"
                        >
                          <div className="flex items-center">
                            <span className="font-medium">{participant.name}</span>
                            {participant.name === userName && (
                              <span className="ml-2 text-xs bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 px-2 py-0.5 rounded-full">
                                You
                              </span>
                            )}
                            {!participant.isActive && (
                              <span className="ml-2 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
                                Offline
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="w-32 bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                              <div className="bg-teal-500 h-full" style={{ width: `${participant.progress}%` }}></div>
                            </div>
                            <span className="text-sm">{participant.wpm} WPM</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Room List */}
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold">Typing Rooms</h3>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-teal-600 hover:bg-teal-700">
                        Create Room
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New Room</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div>
                          <Label htmlFor="room-name">Room Name</Label>
                          <Input
                            id="room-name"
                            value={newRoomName}
                            onChange={(e) => setNewRoomName(e.target.value)}
                            placeholder={`${userName}'s Room`}
                            className="mt-1"
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          The room will use your current settings for difficulty, mode, and time/word limit.
                        </p>
                      </div>
                      <Button
                        onClick={createRoom}
                        disabled={!userName.trim()}
                        className="bg-teal-600 hover:bg-teal-700"
                      >
                        Create Room
                      </Button>
                    </DialogContent>
                  </Dialog>
                </div>

                {rooms.length > 0 ? (
                  <div className="space-y-3">
                    {rooms.map((room) => (
                      <div key={room.id} className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-semibold">{room.name}</h4>
                          <div className="text-xs">
                            <span className="bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200 px-2 py-0.5 rounded-full">
                              {room.participants.filter((p) => p.isActive).length} active
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-sm mb-3">
                          <div>
                            <span className="mr-3">Created by: {room.creatorName}</span>
                          </div>
                          <div>
                            <span className="mr-3">{room.difficulty} difficulty</span>
                            <span>{room.mode === "time" ? `${room.limit}s` : `${room.limit} words`}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => joinRoom(room.id)} className="bg-teal-600 hover:bg-teal-700">
                            {room.participants.some((p) => p.name === userName) ? "Rejoin Room" : "Join Room"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(getRoomLink(room.id))}
                            className="bg-white dark:bg-slate-800"
                          >
                            <Share2 className="h-4 w-4 mr-1" />
                            Invite
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-6 text-center shadow-sm">
                    <p className="text-slate-600 dark:text-slate-400 mb-4">
                      No rooms available. Create your first room to type with friends!
                    </p>
                    <Button onClick={createRoom} disabled={!userName.trim()} className="bg-teal-600 hover:bg-teal-700">
                      Create Room
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
          <Collapsible open={statsOpen} onOpenChange={setStatsOpen} className="w-full">
            <CollapsibleTrigger className="flex items-center justify-center w-full py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors">
              <div className="flex items-center">
                <BarChart2 className="h-5 w-5 mr-2 text-teal-600 dark:text-teal-400" />
                <span className="text-lg font-semibold">Your Stats</span>
                {statsOpen ? <ChevronUp className="h-5 w-5 ml-2" /> : <ChevronDown className="h-5 w-5 ml-2" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm text-center">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Best WPM</div>
                  <div className="text-xl font-bold text-teal-600 dark:text-teal-400">{stats.wpm || 0}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm text-center">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Avg. Accuracy</div>
                  <div className="text-xl font-bold text-teal-600 dark:text-teal-400">{stats.accuracy || 100}%</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm text-center">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Tests Completed</div>
                  <div className="text-xl font-bold text-teal-600 dark:text-teal-400">{stats.completedTests || 0}</div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm text-center">
                  <div className="text-sm text-slate-500 dark:text-slate-400">Total Characters</div>
                  <div className="text-xl font-bold text-teal-600 dark:text-teal-400">{stats.totalChars || 0}</div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  )
}
