import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { authClient } from '../lib/auth-client';
import type { GetProfileResponse } from '../gen/auth/v1/auth_pb';

interface AuthContextType {
  user: GetProfileResponse | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (authorizationUrl: string) => void;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GetProfileResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem('access_token')
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(
    localStorage.getItem('refresh_token')
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (accessToken) {
      fetchProfile();
    } else {
      setIsLoading(false);
    }
  }, [accessToken]);

  const fetchProfile = async () => {
    try {
      const profile = await authClient.getProfile(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }
      );
      setUser(profile);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  const login = (authorizationUrl: string) => {
    window.location.href = authorizationUrl;
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  };

  const setTokens = (newAccessToken: string, newRefreshToken: string) => {
    setAccessToken(newAccessToken);
    setRefreshToken(newRefreshToken);
    localStorage.setItem('access_token', newAccessToken);
    localStorage.setItem('refresh_token', newRefreshToken);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        login,
        logout,
        setTokens,
        isAuthenticated: !!user,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
