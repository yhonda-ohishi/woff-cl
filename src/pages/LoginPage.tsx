import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authClient } from '../lib/auth-client';
import './LoginPage.css';

export function LoginPage() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (provider: 'woff' | 'line') => {
    setIsLoading(true);
    setError(null);

    try {
      const state = generateRandomState();
      // モバイルでセッションが切れても大丈夫なようにlocalStorageを使用
      localStorage.setItem('oauth_state', state);
      localStorage.setItem('oauth_provider', provider);

      const scopes = provider === 'line'
        ? ['profile', 'openid', 'email']
        : ['user', 'user.read'];

      const response = await authClient.getAuthorizationURL({
        provider,
        redirectUri: window.location.origin + '/callback',
        state,
        scopes,
      });

      login(response.authorizationUrl);
    } catch (err) {
      console.error('Failed to get authorization URL:', err);
      setError('Failed to initiate login. Please check that the backend is registered.');
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>ログイン</h1>
        <p>ログイン方法を選択してください</p>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="login-buttons">
          <button
            onClick={() => handleLogin('woff')}
            disabled={isLoading}
            className="login-button login-button-woff"
          >
            {isLoading ? 'リダイレクト中...' : '企業アカウントでログイン'}
            <span className="login-button-sub">LINE WORKS</span>
          </button>

          <button
            onClick={() => handleLogin('line')}
            disabled={isLoading}
            className="login-button login-button-line"
          >
            {isLoading ? 'リダイレクト中...' : 'LINEでログイン'}
            <span className="login-button-sub">LINE Login</span>
          </button>
        </div>

        <p className="info-text">
          認証画面にリダイレクトされます
        </p>
      </div>
    </div>
  );
}

function generateRandomState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}
