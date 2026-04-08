"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const signUp = async () => {
    setMessage("Creating account...");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Account created. You can now log in.");
  };

  const signIn = async () => {
    setMessage("Signing in...");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    const user = data.user;

    await supabase
      .from("players")
      .upsert(
        {
          id: user.id,
          email: user.email,
          name: user.email?.split("@")[0] || "Player",
          country: "South Africa",
          is_online: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );

    setMessage("Login successful.");
    window.location.href = "/online";
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-zinc-900 rounded-2xl p-8 shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6">Login / Sign Up</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white text-black mb-4"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white text-black mb-4"
        />

        <div className="space-y-3">
          <button
            onClick={signUp}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold"
          >
            Sign Up
          </button>

          <button
            onClick={signIn}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold"
          >
            Login
          </button>
        </div>

        {message && (
          <p className="mt-4 text-center text-sm text-gray-300">{message}</p>
        )}
      </div>
    </main>
  );
}