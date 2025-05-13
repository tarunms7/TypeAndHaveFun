"use client"

import { useState, useEffect, useRef } from "react"

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  // State to store our value
  const [storedValue, setStoredValue] = useState<T>(initialValue)

  // Flag to track if we've initialized from localStorage
  const hasInitialized = useRef(false)

  // Initialize from localStorage only once
  useEffect(() => {
    // Skip if we're not in a browser or already initialized
    if (typeof window === "undefined" || hasInitialized.current) return

    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key)

      if (item) {
        // Parse stored json
        const value = JSON.parse(item)
        setStoredValue(value)
      } else {
        // If no value in localStorage, set it to initialValue
        window.localStorage.setItem(key, JSON.stringify(initialValue))
      }
    } catch (error) {
      console.log("Error reading localStorage key", key, ":", error)
    }

    // Mark as initialized
    hasInitialized.current = true
  }, [key]) // Only re-run if key changes, not on initialValue changes

  // Return a wrapped version of useState's setter function that
  // persists the new value to localStorage.
  const setValue = (value: T) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value

      // Save state
      setStoredValue(valueToStore)

      // Save to local storage
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore))
      }
    } catch (error) {
      console.log("Error setting localStorage key", key, ":", error)
    }
  }

  return [storedValue, setValue]
}
