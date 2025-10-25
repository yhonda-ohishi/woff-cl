import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { GetProfileResponse } from '../gen/auth/v1/auth_pb';

interface AuthContextType {
  user: GetProfileResponse | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (authorizationUrl: string) => void;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: GetProfileResponse) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// localStorageからユーザー情報を復元
function loadUserFromStorage(): GetProfileResponse | null {
  const userData = localStorage.getItem('user_data');
  if (!userData) return null;

  try {
    const parsed = JSON.parse(userData);
    // 個別にフィールドを設定してGetProfileResponseを作成
    return new GetProfileResponse({
      userId: parsed.userId || '',
      userName: parsed.userName || '',
      email: parsed.email || '',
      displayName: parsed.displayName || '',
      domainId: parsed.domainId || '',
      roles: parsed.roles || [],
      profileImageUrl: parsed.profileImageUrl || '',
    });
  } catch (error) {
    console.error('Failed to parse user data:', error);
    localStorage.removeItem('user_data');
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<GetProfileResponse | null>(loadUserFromStorage());
  const [accessToken, setAccessToken] = useState<string | null>(
    localStorage.getItem('access_token')
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(
    localStorage.getItem('refresh_token')
  );
  const [isLoading] = useState(false);

  const setUser = (newUser: GetProfileResponse) => {
    setUserState(newUser);
    // ユーザー情報をlocalStorageに保存（プレーンなJSONオブジェクトとして）
    const userData = {
      userId: newUser.userId,
      userName: newUser.userName,
      email: newUser.email,
      displayName: newUser.displayName,
      domainId: newUser.domainId,
      roles: newUser.roles,
      profileImageUrl: newUser.profileImageUrl,
    };
    localStorage.setItem('user_data', JSON.stringify(userData));
  };

  const login = (authorizationUrl: string) => {
    window.location.href = authorizationUrl;
  };

  const logout = () => {
    setUserState(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
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
        setUser,
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
