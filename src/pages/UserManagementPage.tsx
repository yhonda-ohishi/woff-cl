import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createPromiseClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { AuthService } from '../gen/auth/v1/auth_connect';
import { ListUsersRequest, UpdateUserRolesRequest, DeleteUserRequest, RestoreUserRequest, User } from '../gen/auth/v1/auth_pb';
import './UserManagementPage.css';

type ViewType = 'users' | 'profile' | 'qr' | 'nfc';

export function UserManagementPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<ViewType>('users');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // User list state
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRoles, setEditingRoles] = useState<string[]>([]);

  // NFC state
  const [isScanning, setIsScanning] = useState(false);
  const [nfcData, setNfcData] = useState<string[]>([]);
  const [nfcError, setNfcError] = useState<string | null>(null);
  const [isNfcSupported, setIsNfcSupported] = useState(true);

  // Create API client
  const transport = createConnectTransport({
    baseUrl: '/api',
    credentials: 'include',
  });
  const authClient = createPromiseClient(AuthService, transport);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Fetch users from API
  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    setUsersError(null);
    try {
      console.log('Fetching users...');
      const response = await authClient.listUsers(new ListUsersRequest());
      console.log('ListUsers response:', response);
      console.log('Users:', response.users);
      response.users.forEach((u, i) => {
        console.log(`User ${i}:`, {
          userId: u.userId,
          userName: u.userName,
          displayName: u.displayName,
          roles: u.roles,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          isDeleted: u.isDeleted,
        });
      });
      setUsers(response.users);
    } catch (error: any) {
      console.error('Failed to fetch users:', error);
      setUsersError(error.message || 'ユーザー一覧の取得に失敗しました');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Update user roles
  const handleUpdateRoles = async (userId: string, roles: string[]) => {
    try {
      const response = await authClient.updateUserRoles(new UpdateUserRolesRequest({
        userId,
        roles,
      }));
      if (response.success) {
        await fetchUsers(); // Refresh user list
        setEditingUserId(null);
      } else {
        alert(response.message || 'ロールの更新に失敗しました');
      }
    } catch (error: any) {
      console.error('Failed to update roles:', error);
      alert(error.message || 'ロールの更新に失敗しました');
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: string) => {
    if (!confirm('このユーザーを削除しますか？')) return;

    try {
      const response = await authClient.deleteUser(new DeleteUserRequest({ userId }));
      if (response.success) {
        await fetchUsers(); // Refresh user list
      } else {
        alert(response.message || 'ユーザーの削除に失敗しました');
      }
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      alert(error.message || 'ユーザーの削除に失敗しました');
    }
  };

  // Restore user
  const handleRestoreUser = async (userId: string) => {
    try {
      const response = await authClient.restoreUser(new RestoreUserRequest({ userId }));
      if (response.success) {
        await fetchUsers(); // Refresh user list
      } else {
        alert(response.message || 'ユーザーの復元に失敗しました');
      }
    } catch (error: any) {
      console.error('Failed to restore user:', error);
      alert(error.message || 'ユーザーの復元に失敗しました');
    }
  };

  // Start editing roles
  const startEditingRoles = (userId: string, currentRoles: string[]) => {
    setEditingUserId(userId);
    setEditingRoles([...currentRoles]);
  };

  // Toggle role in editing state
  const toggleRole = (role: string) => {
    if (editingRoles.includes(role)) {
      setEditingRoles(editingRoles.filter(r => r !== role));
    } else {
      setEditingRoles([...editingRoles, role]);
    }
  };

  // Load users on mount and when switching to users view
  useEffect(() => {
    if (currentView === 'users') {
      fetchUsers();
    }
  }, [currentView]);

  const startNFCScan = async () => {
    setNfcError(null);

    if (!('NDEFReader' in window)) {
      setIsNfcSupported(false);
      setNfcError('このブラウザはWeb NFCをサポートしていません。Chrome for Android 89以降をお試しください。');
      return;
    }

    try {
      const ndef = new (window as any).NDEFReader();
      setIsScanning(true);

      await ndef.scan();
      console.log('NFC scan started');

      ndef.addEventListener('reading', ({ message, serialNumber }: any) => {
        console.log('NFC tag detected:', serialNumber);

        const timestamp = new Date().toLocaleTimeString('ja-JP');
        const newEntry = `[${timestamp}] UUID: ${serialNumber}`;

        setNfcData((prev) => [newEntry, ...prev]);

        for (const record of message.records) {
          console.log('Record type:', record.recordType);
          console.log('Record data:', record.data);

          if (record.recordType === 'text') {
            const textDecoder = new TextDecoder(record.encoding);
            const text = textDecoder.decode(record.data);
            console.log('Text content:', text);
          }
        }
      });

      ndef.addEventListener('readingerror', () => {
        setNfcError('NFCタグの読み取りに失敗しました。');
        console.error('NFC reading error');
      });

    } catch (err: any) {
      setIsScanning(false);
      console.error('NFC scan error:', err);

      if (err.name === 'NotAllowedError') {
        setNfcError('NFC機能の使用が拒否されました。ブラウザの設定を確認してください。');
      } else if (err.name === 'NotSupportedError') {
        setNfcError('このデバイスはNFCをサポートしていません。');
      } else {
        setNfcError(`エラー: ${err.message}`);
      }
    }
  };

  const stopNFCScan = () => {
    setIsScanning(false);
  };

  const clearNfcHistory = () => {
    setNfcData([]);
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  console.log('User data:', user);
  console.log('User roles:', user.roles);

  return (
    <div className="management-container">
      <nav className="management-nav">
        <div className="nav-brand">
          <h2>WOFF管理</h2>
        </div>
        <button className="hamburger-button" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          ☰
        </button>
      </nav>

      {isMenuOpen && (
        <div className="dropdown-menu">
          <div className="dropdown-overlay" onClick={() => setIsMenuOpen(false)}></div>
          <div className="dropdown-content">
            <button
              className={`dropdown-item ${currentView === 'profile' ? 'active' : ''}`}
              onClick={() => {
                setCurrentView('profile');
                setIsMenuOpen(false);
              }}
            >
              <span className="menu-icon">👤</span>
              <span>プロフィール</span>
            </button>
            <button
              className={`dropdown-item ${currentView === 'users' ? 'active' : ''}`}
              onClick={() => {
                setCurrentView('users');
                setIsMenuOpen(false);
              }}
            >
              <span className="menu-icon">👥</span>
              <span>ユーザー一覧</span>
            </button>
            <button
              className={`dropdown-item ${currentView === 'nfc' ? 'active' : ''}`}
              onClick={() => {
                setCurrentView('nfc');
                setIsMenuOpen(false);
              }}
            >
              <span className="menu-icon">📱</span>
              <span>NFC読み取り</span>
            </button>
            <button
              className={`dropdown-item ${currentView === 'qr' ? 'active' : ''}`}
              onClick={() => {
                setCurrentView('qr');
                setIsMenuOpen(false);
              }}
            >
              <span className="menu-icon">🔲</span>
              <span>QRコード</span>
            </button>
            <div className="dropdown-divider"></div>
            <button className="dropdown-item" onClick={handleLogout}>
              <span className="menu-icon">🚪</span>
              <span>ログアウト</span>
            </button>
          </div>
        </div>
      )}

      <div className="management-content">
        <main className="management-main">
          {currentView === 'profile' && (
            <>
              <div className="page-header">
                <h1>マイプロフィール</h1>
              </div>

              <div className="profile-section">
                <div className="profile-card-large">
                  {user.profileImageUrl && (
                    <img
                      src={user.profileImageUrl}
                      alt="Profile"
                      className="profile-image-large"
                    />
                  )}
                  <h2>{user.displayName || user.userName}</h2>
                  <p className="profile-email">{user.email}</p>

                  <div className="profile-details">
                    <div className="detail-row">
                      <span className="detail-label">ユーザー名</span>
                      <span className="detail-value">{user.userName}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">ユーザーID</span>
                      <span className="detail-value">{user.userId}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">ドメインID</span>
                      <span className="detail-value">{user.domainId || 'N/A'}</span>
                    </div>
                    {user.roles && user.roles.length > 0 && (
                      <div className="detail-row">
                        <span className="detail-label">ロール</span>
                        <div className="detail-value">
                          {user.roles.map((role, index) => (
                            <span key={index} className="role-badge-small">
                              {role}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {currentView === 'qr' && (
            <>
              <div className="page-header">
                <h1>QRコード</h1>
              </div>

              <div className="qr-section">
                <div className="qr-card-inline">
                  <p className="qr-description">
                    このQRコードをスキャンしてサイトにアクセスできます
                  </p>

                  <div className="qr-code-wrapper">
                    <QRCodeSVG
                      value={window.location.origin}
                      size={256}
                      level="H"
                      includeMargin={true}
                      className="qr-code"
                    />
                  </div>

                  <div className="qr-url">
                    <strong>URL:</strong> {window.location.origin}
                  </div>

                  <div className="qr-info">
                    <h3>使い方</h3>
                    <ol>
                      <li>スマートフォンのカメラアプリを起動</li>
                      <li>QRコードにカメラを向ける</li>
                      <li>表示された通知をタップしてサイトを開く</li>
                    </ol>
                  </div>
                </div>
              </div>
            </>
          )}

          {currentView === 'nfc' && (
            <>
              <div className="page-header">
                <h1>NFC読み取り</h1>
              </div>

              <div className="nfc-section">
                {!isNfcSupported && (
                  <div className="nfc-warning">
                    ⚠️ Web NFCはChrome for Android 89以降でのみ利用可能です
                  </div>
                )}

                {nfcError && (
                  <div className="nfc-error">
                    {nfcError}
                  </div>
                )}

                <div className="nfc-controls">
                  {!isScanning ? (
                    <button
                      onClick={startNFCScan}
                      className="nfc-button nfc-button-start"
                      disabled={!isNfcSupported}
                    >
                      📱 スキャン開始
                    </button>
                  ) : (
                    <div className="nfc-scanning">
                      <div className="nfc-pulse"></div>
                      <p>NFCタグをデバイスに近づけてください...</p>
                      <button
                        onClick={stopNFCScan}
                        className="nfc-button nfc-button-stop"
                      >
                        停止
                      </button>
                    </div>
                  )}
                </div>

                {nfcData.length > 0 && (
                  <div className="nfc-history">
                    <div className="nfc-history-header">
                      <h2>読み取り履歴</h2>
                      <button onClick={clearNfcHistory} className="nfc-clear-button">
                        クリア
                      </button>
                    </div>
                    <div className="nfc-list">
                      {nfcData.map((entry, index) => (
                        <div key={index} className="nfc-item">
                          {entry}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="nfc-info">
                  <h3>使い方</h3>
                  <ol>
                    <li>「スキャン開始」ボタンをタップ</li>
                    <li>NFCタグをスマートフォンの背面に近づける</li>
                    <li>読み取ったUUIDが履歴に表示されます</li>
                  </ol>
                </div>
              </div>
            </>
          )}

          {currentView === 'users' && (
            <>
              <div className="page-header">
                <h1>ユーザー管理</h1>
              </div>

              {usersError && (
                <div className="nfc-error">
                  {usersError}
                </div>
              )}

              {isLoadingUsers ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>読み込み中...</div>
              ) : (
                <>
                  <div className="user-stats">
                    <div className="stat-card">
                      <div className="stat-icon">👥</div>
                      <div className="stat-info">
                        <div className="stat-value">{users.length}</div>
                        <div className="stat-label">総ユーザー数</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">✅</div>
                      <div className="stat-info">
                        <div className="stat-value">{users.filter(u => !u.isDeleted).length}</div>
                        <div className="stat-label">アクティブ</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">🔒</div>
                      <div className="stat-info">
                        <div className="stat-value">{users.filter(u => u.isDeleted).length}</div>
                        <div className="stat-label">削除済み</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon">👑</div>
                      <div className="stat-info">
                        <div className="stat-value">{users.filter(u => u.roles.includes('admin')).length}</div>
                        <div className="stat-label">管理者</div>
                      </div>
                    </div>
                  </div>

                  <div className="user-table-container">
                    <table className="user-table">
                      <thead>
                        <tr>
                          <th>ユーザー</th>
                          <th>登録日時</th>
                          <th>ロール</th>
                          <th>ステータス</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((userInfo) => (
                          <tr key={userInfo.userId}>
                            <td data-label="ユーザー">
                              <div className="user-info">
                                <div className="user-display-name">
                                  <span className={`provider-prefix provider-${userInfo.provider || 'woff'}`}>
                                    {(userInfo.provider || 'woff').charAt(0).toUpperCase()}
                                  </span>
                                  {userInfo.displayName || userInfo.userName}
                                </div>
                                <div className="user-username">@{userInfo.userName}</div>
                              </div>
                            </td>
                            <td data-label="登録日時">
                              {userInfo.createdAt ? (
                                <>
                                  <div>{new Date(userInfo.createdAt).toLocaleDateString('ja-JP', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                  })}</div>
                                  <div style={{ fontSize: '0.8rem', color: '#999' }}>
                                    {new Date(userInfo.createdAt).toLocaleTimeString('ja-JP', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    })}
                                  </div>
                                </>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                            <td data-label="ロール">
                              {editingUserId === userInfo.userId ? (
                                <div className="roles-edit">
                                  {['admin', 'user', 'viewer'].map((role) => (
                                    <label key={role}>
                                      <input
                                        type="checkbox"
                                        checked={editingRoles.includes(role)}
                                        onChange={() => toggleRole(role)}
                                      />
                                      <span>{role}</span>
                                    </label>
                                  ))}
                                  <div className="action-buttons" style={{ marginTop: '0.5rem' }}>
                                    <button
                                      onClick={() => handleUpdateRoles(userInfo.userId, editingRoles)}
                                      className="action-button"
                                      title="保存"
                                    >
                                      💾
                                    </button>
                                    <button
                                      onClick={() => setEditingUserId(null)}
                                      className="action-button"
                                      title="キャンセル"
                                    >
                                      ✖️
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                userInfo.roles && userInfo.roles.length > 0 ? (
                                  <div className="roles-cell">
                                    {userInfo.roles.map((role: string, index: number) => (
                                      <span key={index} className="role-badge-small">
                                        {role}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted">なし</span>
                                )
                              )}
                            </td>
                            <td data-label="ステータス">
                              {userInfo.isDeleted ? (
                                <span className="status-badge status-inactive">削除済み</span>
                              ) : (
                                <span className="status-badge status-active">アクティブ</span>
                              )}
                            </td>
                            <td data-label="操作">
                              <div className="action-buttons">
                                {!userInfo.isDeleted && (
                                  <>
                                    <button
                                      className="action-button"
                                      title="ロール編集"
                                      onClick={() => startEditingRoles(userInfo.userId, userInfo.roles)}
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      className="action-button"
                                      title="削除"
                                      onClick={() => handleDeleteUser(userInfo.userId)}
                                    >
                                      🗑️
                                    </button>
                                  </>
                                )}
                                {userInfo.isDeleted && (
                                  <button
                                    className="action-button"
                                    title="復元"
                                    onClick={() => handleRestoreUser(userInfo.userId)}
                                  >
                                    ♻️
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
