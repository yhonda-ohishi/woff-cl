import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './ProfilePage.css';

export function ProfilePage() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="profile-container">
        <div className="profile-card">
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-container">
        <div className="profile-card">
          <p>Please login to view your profile</p>
          <button onClick={() => navigate('/')}>Go to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-card">
        <div className="profile-header">
          <h1>User Profile</h1>
          <button onClick={() => navigate('/management')} className="management-button">
            管理画面
          </button>
        </div>

        <div className="profile-info">
          {user.profileImageUrl && (
            <img
              src={user.profileImageUrl}
              alt="Profile"
              className="profile-image"
            />
          )}

          <div className="info-group">
            <label>Display Name</label>
            <p>{user.displayName || 'N/A'}</p>
          </div>

          <div className="info-group">
            <label>Username</label>
            <p>{user.userName || 'N/A'}</p>
          </div>

          <div className="info-group">
            <label>Email</label>
            <p>{user.email || 'N/A'}</p>
          </div>

          <div className="info-group">
            <label>User ID</label>
            <p>{user.userId}</p>
          </div>

          <div className="info-group">
            <label>Domain ID</label>
            <p>{user.domainId || 'N/A'}</p>
          </div>

          {user.roles && user.roles.length > 0 && (
            <div className="info-group">
              <label>Roles</label>
              <div className="roles">
                {user.roles.map((role, index) => (
                  <span key={index} className="role-badge">
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>
    </div>
  );
}
