import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authClient } from '../lib/auth-client';

export function CallbackPage() {
  const navigate = useNavigate();
  const { setTokens } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const storedState = sessionStorage.getItem('oauth_state');

      if (!code) {
        setError('Authorization code not found');
        setIsProcessing(false);
        return;
      }

      if (state !== storedState) {
        setError('Invalid state parameter - possible CSRF attack');
        setIsProcessing(false);
        return;
      }

      try {
        const response = await authClient.exchangeCode({
          code,
          redirectUri: window.location.origin + '/callback',
          state: state || '',
        });

        setTokens(response.accessToken, response.refreshToken);
        sessionStorage.removeItem('oauth_state');
        navigate('/profile');
      } catch (err) {
        console.error('Failed to exchange code:', err);
        setError('Failed to complete authentication. Please try again.');
        setIsProcessing(false);
      }
    };

    handleCallback();
  }, [navigate, setTokens]);

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Authentication Error</h2>
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={() => navigate('/')}>Go to Login</button>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Processing authentication...</h2>
        <p>Please wait while we complete your login.</p>
      </div>
    );
  }

  return null;
}
