// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { login as apiLogin, register as apiRegister, logout as apiLogout, getCurrentUser } from "../services/authApi";
import { migrateLegacyBrowserData } from "../utils/documentStorage";

// Create context
const AuthContext = createContext();

// Provider component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const migrateSavedData = useCallback(async () => {
    try {
      await migrateLegacyBrowserData();
    } catch (error) {
      console.error("Could not move the previous browser library to your account:", error);
    }
  }, []);

  // On mount, check if we have a logged-in user
  useEffect(() => {
    async function loadUser() {
      try {
        const current = await getCurrentUser();
        if (current) await migrateSavedData();
        setUser(current);
      } catch (err) {
        console.error("Failed to fetch current user:", err);
      } finally {
        setAuthLoading(false);
      }
    }
    loadUser();
  }, [migrateSavedData]);

  // Login function
  const login = async (email, password) => {
    const data = await apiLogin({ email, password });
    await migrateSavedData();
    setUser(data.user);
  };

  // Register function
  const register = async (name, email, password) => {
    const data = await apiRegister({ name, email, password });
    await migrateSavedData();
    setUser(data.user);
  };

  // Logout function
  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, authLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook for easy access
export function useAuth() {
  return useContext(AuthContext);
}

export default AuthProvider;
