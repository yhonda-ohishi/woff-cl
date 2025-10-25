import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './UserManagementPage.css';

export function UserManagementPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) {
    navigate('/');
    return null;
  }

  return (
    <div className="management-container">
      <nav className="management-nav">
        <div className="nav-brand">
          <h2>WOFF管理</h2>
        </div>
        <div className="nav-user">
          <span className="user-name">{user.displayName || user.userName}</span>
          <button onClick={handleLogout} className="nav-logout-button">
            ログアウト
          </button>
        </div>
      </nav>

      <div className="management-content">
        <aside className="management-sidebar">
          <ul className="sidebar-menu">
            <li className="menu-item active">
              <button onClick={() => navigate('/profile')}>
                <span className="menu-icon">👤</span>
                <span>プロフィール</span>
              </button>
            </li>
            <li className="menu-item">
              <button>
                <span className="menu-icon">👥</span>
                <span>ユーザー一覧</span>
              </button>
            </li>
            <li className="menu-item">
              <button>
                <span className="menu-icon">⚙️</span>
                <span>設定</span>
              </button>
            </li>
            <li className="menu-item">
              <button>
                <span className="menu-icon">📊</span>
                <span>統計</span>
              </button>
            </li>
          </ul>
        </aside>

        <main className="management-main">
          <div className="page-header">
            <h1>ユーザー管理</h1>
            <button className="primary-button">
              + 新規ユーザー
            </button>
          </div>

          <div className="user-stats">
            <div className="stat-card">
              <div className="stat-icon">👥</div>
              <div className="stat-info">
                <div className="stat-value">24</div>
                <div className="stat-label">総ユーザー数</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-info">
                <div className="stat-value">18</div>
                <div className="stat-label">アクティブ</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🔒</div>
              <div className="stat-info">
                <div className="stat-value">6</div>
                <div className="stat-label">無効</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🆕</div>
              <div className="stat-info">
                <div className="stat-value">3</div>
                <div className="stat-label">今月の新規</div>
              </div>
            </div>
          </div>

          <div className="user-table-container">
            <div className="table-header">
              <input
                type="text"
                placeholder="ユーザーを検索..."
                className="search-input"
              />
              <select className="filter-select">
                <option value="all">すべて</option>
                <option value="active">アクティブ</option>
                <option value="inactive">無効</option>
              </select>
            </div>

            <table className="user-table">
              <thead>
                <tr>
                  <th>ユーザー</th>
                  <th>メール</th>
                  <th>ドメインID</th>
                  <th>ロール</th>
                  <th>ステータス</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div className="user-cell">
                      {user.profileImageUrl ? (
                        <img
                          src={user.profileImageUrl}
                          alt={user.displayName}
                          className="user-avatar"
                        />
                      ) : (
                        <div className="user-avatar-placeholder">
                          {(user.displayName || user.userName).charAt(0)}
                        </div>
                      )}
                      <div className="user-info">
                        <div className="user-display-name">
                          {user.displayName || user.userName}
                        </div>
                        <div className="user-username">@{user.userName}</div>
                      </div>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>{user.domainId}</td>
                  <td>
                    {user.roles && user.roles.length > 0 ? (
                      <div className="roles-cell">
                        {user.roles.map((role, index) => (
                          <span key={index} className="role-badge-small">
                            {role}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted">なし</span>
                    )}
                  </td>
                  <td>
                    <span className="status-badge status-active">アクティブ</span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-button" title="編集">
                        ✏️
                      </button>
                      <button className="action-button" title="削除">
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
