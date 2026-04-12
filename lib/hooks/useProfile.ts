'use client'

import { useState, useEffect } from 'react'

export interface UserProfile {
  id: string
  full_name: string
  role_id: number
  role_name: string
  permissions: string[]
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading]  = useState(true)

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { setProfile(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function can(perm: string): boolean {
    return profile?.permissions.includes(perm) ?? false
  }

  return { profile, loading, can }
}
