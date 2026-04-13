"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validateInputs = () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setIsError(true);
      setMessage("Enter both email and password first.");
      return null;
    }

    if (password.length < 6) {
      setIsError(true);
      setMessage("Password must be at least 6 characters.");
      return null;
    }

    return {
      email: normalizedEmail,
      password,
    };
  };

  const signUp = async () => {
    const credentials = validateInputs();

    if (!credentials) return;

    setIsLoading(true);
    setIsError(false);
    setMessage("Creating account...");

    try {
      const { error } = await supabase.auth.signUp(credentials);

      if (error) {
        setIsError(true);
        setMessage(error.message);
        return;
      }

      setIsError(false);
      setMessage("Account created. You can now log in.");
    } catch (error) {
      console.error("Sign up failed", error);
      setIsError(true);
      setMessage("Sign up failed. Check your internet and Supabase settings.");
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async () => {
    const credentials = validateInputs();

    if (!credentials) return;

    setIsLoading(true);
    setIsError(false);
    setMessage("Signing in...");

    try {
      const { data, error } = await supabase.auth.signInWithPassword(credentials);

      if (error) {
        setIsError(true);
        setMessage(error.message);
        return;
      }

      const user = data.user;

      const { error: playerError } = await supabase
        .from("players")
        .upsert(
          {
            id: user.id,
            email: user.email,
            name: user.email?.split("@")[0] || "Player",
            age: 18,
            country: "South Africa",
            is_online: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      if (playerError) {
        console.error("Player sync failed", playerError);
        setIsError(true);
        setMessage(`Login worked, but player setup failed: ${playerError.message}`);
        return;
      }

      setIsError(false);
      setMessage("Login successful.");
      window.location.href = "/online";
    } catch (error) {
      console.error("Login failed", error);
      setIsError(true);
      setMessage("Login failed. Check your internet and Supabase settings.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl p-8 shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6">Login / Sign Up</h1>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white text-black"
          />

          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) {
                void signIn();
              }
            }}
            className="w-full px-4 py-3 rounded-xl bg-white text-black"
          />

          <button
            type="button"
            onClick={() => void signUp()}
            disabled={isLoading}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? "Please wait..." : "Sign Up"}
          </button>

          <button
            type="button"
            onClick={() => void signIn()}
            disabled={isLoading}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Login
          </button>
        </div>

        {message && (
          <p
            className={`mt-4 rounded-xl px-4 py-3 text-center text-sm ${
              isError
                ? "bg-red-500/15 text-red-200 border border-red-400/20"
                : "bg-emerald-500/15 text-emerald-200 border border-emerald-400/20"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
