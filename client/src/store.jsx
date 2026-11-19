import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = guest
  const [categories, setCategories] = useState([]);
  const [cartCount, setCartCount] = useState(0);

  const refreshMe = useCallback(async () => {
    try {
      const { user } = await api.get('/me');
      setUser(user);
      setCartCount(user?.cartCount || 0);
      return user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshMe();
    api.get('/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, [refreshMe]);

  const setCart = useCallback((cart) => setCartCount(cart?.itemCount || 0), []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
    setCartCount(0);
  }, []);

  return (
    <Ctx.Provider value={{ user, setUser, refreshMe, categories, cartCount, setCart, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
