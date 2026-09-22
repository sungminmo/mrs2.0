import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

const historyKey = 'mrsViewState'

function readHistoryValue<T>(key: string, fallback: T): T {
  const state = window.history.state
  if (!state || typeof state !== 'object') return fallback
  const views = state[historyKey]
  if (!views || typeof views !== 'object' || !Object.hasOwn(views, key)) return fallback
  return views[key] as T
}

export function useHistoryState<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, () => void] {
  const initial = useRef(initialValue)
  const [value, setValue] = useState(() => readHistoryValue(key, initialValue))
  const valueRef = useRef(value)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    const restore = () => {
      const restored = readHistoryValue(key, initial.current)
      valueRef.current = restored
      setValue(restored)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [key])

  const navigate = useCallback<Dispatch<SetStateAction<T>>>((nextValue) => {
    const next = typeof nextValue === 'function'
      ? (nextValue as (current: T) => T)(valueRef.current)
      : nextValue
    const currentState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {}
    const currentViews = currentState[historyKey] && typeof currentState[historyKey] === 'object' ? currentState[historyKey] : {}
    window.history.pushState({ ...currentState, [historyKey]: { ...currentViews, [key]: next } }, '', window.location.href)
    valueRef.current = next
    setValue(next)
  }, [key])

  const goBack = useCallback(() => {
    const state = window.history.state
    const views = state && typeof state === 'object' ? state[historyKey] : null
    if (views && typeof views === 'object' && Object.hasOwn(views, key)) {
      window.history.back()
      return
    }
    valueRef.current = initial.current
    setValue(initial.current)
  }, [key])

  return [value, navigate, goBack]
}