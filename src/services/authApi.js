// src/services/authApi.js
const API_BASE = "/api/auth";

async function parseResponse(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || fallback);
  return data;
}

export async function register({ name, email, password }) {
  const res = await fetch(`${API_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // include cookies
    body: JSON.stringify({ name, email, password }),
  });
  return parseResponse(res, "Registration failed.");
}

export async function login({ email, password }) {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  return parseResponse(res, "Login failed.");
}

export async function logout() {
  const res = await fetch(`${API_BASE}/logout`, {
    method: "POST",
    credentials: "include",
  });
  return parseResponse(res, "Logout failed.");
}

export async function getCurrentUser() {
  const res = await fetch(`${API_BASE}/me`, {
    credentials: "include",
  });
  if (res.status === 401) return null;
  const data = await parseResponse(res, "Could not verify your session.");
  return data.user; // { id, name, email }
}
