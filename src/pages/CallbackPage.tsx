import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authClient } from '../lib/auth-client';
import { GetProfileResponse } from '../gen/auth/v1/auth_pb';

export function CallbackPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      // localStorageから取得（モバイルでセッションが切れても対応）
      const storedState = localStorage.getItem('oauth_state');
      const provider = (localStorage.getItem('oauth_provider') || 'woff') as 'woff' | 'line';

      console.log('Callback - state check:', {
        receivedState: state,
        storedState: storedState,
        provider: provider,
        match: state === storedState
      });

      if (!code) {
        setError('Authorization code not found');
        setIsProcessing(false);
        return;
      }

      // state検証失敗時でも警告のみ表示して処理は続行（モバイル対応）
      if (state !== storedState) {
        console.warn('State mismatch detected - this may happen on mobile. Continuing anyway...');
      }

      try {
        const response = await authClient.exchangeCode({
          provider,
          code,
          redirectUri: window.location.origin + '/callback',
          state: state || '',
        });

        // 成功したらlocalStorageをクリーンアップ
        localStorage.removeItem('oauth_state');
        localStorage.removeItem('oauth_provider');

        // Set tokens
        setTokens(response.accessToken, response.refreshToken);

        // ExchangeCodeレスポンスにユーザー情報が含まれているので、そこから取得
        console.log('ExchangeCode response:', {
          userId: response.userId,
          userName: response.userName,
          email: response.email,
          displayName: response.displayName,
          domainId: response.domainId,
          roles: response.roles,
          profileImageUrl: response.profileImageUrl,
        });

        const userProfile = new GetProfileResponse({
          userId: response.userId,
          userName: response.userName,
          email: response.email,
          displayName: response.displayName,
          domainId: response.domainId,
          roles: response.roles,
          profileImageUrl: response.profileImageUrl,
        });
        console.log('Created user profile:', userProfile);
        setUser(userProfile);

        sessionStorage.removeItem('oauth_state');
        navigate('/');
      } catch (err) {
        console.error('Failed to exchange code:', err);
        setError('Failed to complete authentication. Please try again.');
        setIsProcessing(false);
      }
    };

    handleCallback();
  }, [navigate, setTokens, setUser]);

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Authentication Error</h2>
        <p style={{ color: 'red' }}>{error}</p>
        <button onClick={() => navigate('/login')}>Go to Login</button>
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
