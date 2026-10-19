import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiLogIn, FiLoader } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { login as apiLogin } from '../services/api';

export default function Login() {
  const { login } = useAuth();
  const { error: toastError } = useToast();
  const navigate = useNavigate();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!userId.trim() || !password.trim()) {
      toastError('Please enter your ID and password');
      return;
    }
    setLoading(true);
    try {
      const res = await apiLogin(userId.trim(), password);
      login(res.data);
      navigate('/', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed. Please try again.';
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleLogin}>
        <div className="login-logo">
          <img src="/fin.png" alt="PSM logo" />
          <span className="login-subtitle">Office Manager</span>
        </div>

        <h1 className="login-title">Sign In</h1>
        <p className="login-desc">Use your employee or intern ID and password</p>

        <div className="form-group">
          <label className="form-label" htmlFor="user-id">User ID</label>
          <input
            id="user-id"
            className="form-input"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter your employee or intern ID"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="password">Password</label>
          <input
            id="password"
            className="form-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? <FiLoader className="spin" size={18} /> : <FiLogIn size={18} />}
          Sign In
        </button>
      </form>
    </div>
  );
}
