import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authClient } from '../lib/auth-client';
import './LoginPage.css';

export function LoginPage() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const state = generateRandomState();
      sessionStorage.setItem('oauth_state', state);

      const response = await authClient.getAuthorizationURL({
        redirectUri: window.location.origin + '/callback',
        state,
        scopes: ['user', 'user.read'],
      });

      login(response.authorizationUrl);
    } catch (err) {
      console.error('Failed to get authorization URL:', err);
      setError('Failed to initiate login. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>WOFF Authentication</h1>
        <p>Login with your LINE WORKS account</p>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="login-button"
        >
          {isLoading ? 'Redirecting...' : 'Login with LINE WORKS'}
        </button>

        <p className="info-text">
          You will be redirected to LINE WORKS for authentication
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
