import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

// Returns { status, user, profile, isDemo, signIn, signUp, signOut,
// resendVerification, sendPasswordReset, refreshUser, updateProfile,
// continueAsGuest,
// markVerifiedDemo }.
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
