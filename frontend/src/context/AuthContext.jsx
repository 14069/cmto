import { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('cmto_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function validate() {
      const token = localStorage.getItem('cmto_token');
      if (!token) { setLoading(false); return; }
      try {
        const { data } = await api.get('/auth/me');
        setUser(data.user);
        localStorage.setItem('cmto_user', JSON.stringify(data.user));
      } catch {
        localStorage.removeItem('cmto_token');
        localStorage.removeItem('cmto_user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    validate();
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('cmto_token', data.token);
    localStorage.setItem('cmto_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  function logout() {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('cmto_token');
    localStorage.removeItem('cmto_user');
    setUser(null);
  }

  function hasRole(...roles) {
    return user && roles.includes(user.role);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
