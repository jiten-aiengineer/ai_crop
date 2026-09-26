import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getSessionToken, getStoredUser, saveSession, clearSession, type StoredUser } from '../services/storage';
import { logout as apiLogout } from '../services/api';

type AuthState = {
  isLoading: boolean;
  isLoggedIn: boolean;
  token: string | null;
  user: StoredUser | null;
  login: (token: string, user: StoredUser) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const savedToken = await getSessionToken();
        const savedUser = await getStoredUser();
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(savedUser);
        }
      } catch {
        // Storage read failed, remain logged out
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (newToken: string, newUser: StoredUser) => {
    await saveSession(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await apiLogout(token);
      } catch {
        // Server logout failed, proceed anyway
      }
    }
    await clearSession();
    setToken(null);
    setUser(null);
  }, [token]);

  return (
    <AuthContext.Provider value={{ isLoading, isLoggedIn: !!token, token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
