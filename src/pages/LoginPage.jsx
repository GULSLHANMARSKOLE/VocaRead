// src/pages/LoginPage.jsx
import React from "react";
import TopNavigation from "../components/layout/TopNavigation";
import LoginForm from "../components/auth/LoginForm";

export default function LoginPage() {
  return (
    <>
      <TopNavigation />
      <div className="auth-page">
        <LoginForm />
      </div>
    </>
  );
}
