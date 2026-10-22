// src/components/layout/TopNavigation.jsx
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./TopNavigation.css"; // optional: create this CSS

export default function TopNavigation() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      window.alert(error.message || "Could not log out. Please try again.");
    }
  };

  return (
    <header className="topnav">
      <div className="topnav-left">
        <img className="app-icon" src="/favicon.svg" alt="" aria-hidden="true" />
        <span className="app-title">VocaRead</span>
      </div>
      <nav className="topnav-right">
        {user ? (
          <>
            <span>Hello, {user.name}</span>
            <button onClick={handleLogout} className="btn btn-link">
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-link">
              Log In
            </Link>
            <Link to="/register" className="btn btn-primary">
              Sign Up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
