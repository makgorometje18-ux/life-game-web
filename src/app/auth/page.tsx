"use client";

import { useEffect, useState } from "react";
import { GameLogo } from "@/components/game-logo";
import { supabase } from "@/lib/supabase";

const logoLoaderDuration = 6600;
const startingSrdGrant = 370;

type PlayerSyncError = {
  code?: string;
  message: string;
};

const isMissingRecoveryFunction = (error: PlayerSyncError | null) =>
  Boolean(error?.code === "PGRST202" || error?.message.toLowerCase().includes("recover_player_for_current_user"));

const isDuplicateEmailError = (error: PlayerSyncError | null) =>
  Boolean(error?.code === "23505" && error?.message.includes("players_email_key"));

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showLogoLoader, setShowLogoLoader] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    if (!showLogoLoader) return;

    const startedAt = Date.now();
    setLoadingProgress(0);

    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = Math.min(100, Math.round((elapsed / logoLoaderDuration) * 100));
      setLoadingProgress(nextProgress);
    }, 80);

    const timer = window.setTimeout(() => {
      setLoadingProgress(100);
      window.location.href = "/game";
    }, logoLoaderDuration);

    return () => {
      window.clearInterval(progressTimer);
      window.clearTimeout(timer);
    };
  }, [showLogoLoader]);

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
      const { data, error } = await supabase.auth.signUp({
        ...credentials,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });

      if (error) {
        setIsError(true);
        setMessage(error.message);
        return;
      }

      setIsError(false);
      setMessage(
        data.user?.identities?.length
          ? "Account created. You can log in right away."
          : "This email may already be registered. Try logging in or reset the password if needed."
      );
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
      const normalizedEmail = user.email?.trim().toLowerCase() || "";
      const now = new Date().toISOString();
      const freshPlayerPayload = {
        id: user.id,
        email: normalizedEmail,
        name: normalizedEmail.split("@")[0] || "Player",
        age: 18,
        money: startingSrdGrant,
        country: "South Africa",
        is_online: true,
        updated_at: now,
      };
      const activePlayerPayload = {
        email: normalizedEmail,
        is_online: true,
        updated_at: now,
      };

      let playerError: { message: string } | null = null;

      if (normalizedEmail) {
        const recoverByFunction = await supabase.rpc("recover_player_for_current_user");

        if (!recoverByFunction.error) {
          playerError = null;
        } else {
          if (!isMissingRecoveryFunction(recoverByFunction.error)) {
            playerError = recoverByFunction.error;
          }

          if (isMissingRecoveryFunction(recoverByFunction.error)) {
            const activateOwnPlayer = await supabase
              .from("players")
              .update(activePlayerPayload)
              .eq("id", user.id)
              .select("id")
              .maybeSingle();

            playerError = activateOwnPlayer.error ?? null;

            if (!playerError && !activateOwnPlayer.data) {
              const recoverByEmail = await supabase
                .from("players")
                .update({ ...activePlayerPayload, id: user.id })
                .eq("email", normalizedEmail)
                .select("id")
                .maybeSingle();

              playerError = recoverByEmail.error ?? null;

              if (!playerError && !recoverByEmail.data) {
                const createFresh = await supabase.from("players").insert(freshPlayerPayload);
                playerError = createFresh.error ?? null;
              }
            }
          }
        }

        if (isDuplicateEmailError(playerError)) {
          const recoverDuplicate = await supabase
            .from("players")
            .update({ ...activePlayerPayload, id: user.id })
            .eq("email", normalizedEmail)
            .select("id")
            .maybeSingle();

          playerError = recoverDuplicate.error ?? null;
        }
      } else {
        const createFresh = await supabase.from("players").upsert(freshPlayerPayload, { onConflict: "id" });
        playerError = createFresh.error ?? null;
      }

      if (playerError) {
        console.error("Player sync failed", playerError);
        setIsError(true);
        setMessage(`Login worked, but your old player record could not be recovered yet. Run the latest Supabase player recovery SQL once, then log in again.`);
        return;
      }

      setIsError(false);
      setMessage("Login successful. Opening your game...");
      setShowLogoLoader(true);
    } catch (error) {
      console.error("Login failed", error);
      setIsError(true);
      setMessage("Login failed. Check your internet and Supabase settings.");
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerification = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setIsError(true);
      setMessage("Enter your email address first so we can resend verification.");
      return;
    }

    setIsLoading(true);
    setIsError(false);
    setMessage("Sending verification email...");

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
        },
      });

      if (error) {
        setIsError(true);
        setMessage(error.message);
        return;
      }

      setIsError(false);
      setMessage("Verification email sent. Check your inbox and spam folder, then log in again.");
    } catch (error) {
      console.error("Resend verification failed", error);
      setIsError(true);
      setMessage("Could not resend verification email right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (showLogoLoader) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#04111c] px-6 text-white">
        <div className="game-background-photo absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(1,9,16,0.1)_0%,rgba(1,7,13,0.38)_48%,rgba(0,0,0,0.9)_100%)]" />

        <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
          <div className="logo-loader-shell">
            <div className="game-logo-glow" aria-hidden="true" />
            <GameLogo className="game-logo-loader relative z-10 h-52 w-52 text-red-500" />
          </div>
          <div
            className="mt-8 w-full max-w-xs"
            role="progressbar"
            aria-label="Loading game"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={loadingProgress}
          >
            <div className="relative h-8 overflow-hidden rounded-full border border-sky-200/20 bg-black/45 shadow-[0_0_22px_rgba(56,189,248,0.18)]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#dff9ff_58%,#60a5fa_100%)] shadow-[0_0_18px_rgba(125,221,255,0.78)] transition-[width] duration-100 ease-linear"
                style={{ width: `${loadingProgress}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums tracking-[0.12em] text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)]">
                {loadingProgress}%
              </span>
            </div>
          </div>
          <h1 className="mt-3 text-4xl font-black tracking-[0.08em] text-white">Life Game Africa</h1>
          <p className="mt-4 text-base leading-7 text-stone-300">
            Your 3D logo is loading before the game opens.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#04111c] px-6 text-white">
      <div className="game-background-photo absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(1,9,16,0.1)_0%,rgba(1,7,13,0.38)_48%,rgba(0,0,0,0.9)_100%)]" />

      <div className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/10 bg-zinc-900/90 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 flex flex-col items-center text-center">
          <GameLogo className="h-28 w-28 text-white" />
          <h1 className="mt-4 text-3xl font-bold">Login / Sign Up</h1>
          <p className="mt-2 text-sm text-stone-300">Use a real email address so you can recover your account later.</p>
        </div>

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

          <button
            type="button"
            onClick={() => void resendVerification()}
            disabled={isLoading}
            className="hidden w-full rounded-xl border border-white/20 bg-white/5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Resend Verification Email
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
