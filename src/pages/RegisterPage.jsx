import React from "react";
import TopNavigation from "../components/layout/TopNavigation";
import RegisterForm from "../components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <>
      <TopNavigation />
      <div className="auth-page">
        <RegisterForm />
      </div>
    </>
  );
}
