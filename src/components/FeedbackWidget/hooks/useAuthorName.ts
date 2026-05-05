import { useEffect, useRef, useState } from 'react'
import { AUTHOR_NAME_KEY } from '../constants'

export function useAuthorName() {
  const [authorName, setAuthorName] = useState<string | null>(null)
  const authorNameRef = useRef<string | null>(null)
  const [showNameModal, setShowNameModal] = useState(false)
  const [nameInput, setNameInput] = useState('')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTHOR_NAME_KEY)
      if (stored) {
        authorNameRef.current = stored
        setAuthorName(stored)
      }
    } catch {}
  }, [])

  function saveAuthorName(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    authorNameRef.current = trimmed
    setAuthorName(trimmed)
    try { localStorage.setItem(AUTHOR_NAME_KEY, trimmed) } catch {}
  }

  function openNameEditor() {
    setNameInput(authorNameRef.current ?? '')
    setShowNameModal(true)
  }

  return {
    authorName,
    authorNameRef,
    showNameModal,
    setShowNameModal,
    nameInput,
    setNameInput,
    saveAuthorName,
    openNameEditor,
  }
}
