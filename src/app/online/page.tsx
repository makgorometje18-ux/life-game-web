"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Player = {
  id: string;
  email: string;
  name: string | null;
  country: string | null;
  is_online: boolean | null;
};

export default function OnlinePage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    let currentUserId: string | null = null;

    const loadUserAndPlayers = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/auth";
        return;
      }

      currentUserId = user.id;
      setUserEmail(user.email || "");

      await supabase
        .from("players")
        .update({
          is_online: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      const { data } = await supabase
        .from("players")
        .select("id, email, name, country, is_online")
        .eq("is_online", true)
        .order("updated_at", { ascending: false });

      setPlayers(data || []);
    };

    loadUserAndPlayers();

    const refresh = setInterval(async () => {
      const { data } = await supabase
        .from("players")
        .select("id, email, name, country, is_online")
        .eq("is_online", true)
        .order("updated_at", { ascending: false });

      setPlayers(data || []);
    }, 3000);

    const markOffline = async () => {
      if (!currentUserId) return;

      await supabase
        .from("players")
        .update({
          is_online: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentUserId);
    };

    const handleBeforeUnload = () => {
      if (!currentUserId) return;

      supabase
        .from("players")
        .update({
          is_online: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentUserId);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(refresh);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      markOffline();
    };
  }, []);

  const logout = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from("players")
        .update({
          is_online: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
    }

    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="bg-zinc-900 rounded-2xl p-6 mb-6">
          <h1 className="text-3xl font-bold mb-2">Online Players</h1>
          <p className="text-gray-300 mb-6">Logged in as: {userEmail}</p>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => {
                window.location.href = "/game";
              }}
              className="bg-white text-black px-5 py-3 rounded-xl font-semibold"
            >
              Enter Game
            </button>

            <button
              onClick={logout}
              className="bg-red-500 text-white px-5 py-3 rounded-xl font-semibold"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="grid gap-4">
          {players.length === 0 ? (
            <div className="bg-zinc-900 rounded-2xl p-6">
              No players online.
            </div>
          ) : (
            players.map((player) => (
              <div key={player.id} className="bg-zinc-900 rounded-2xl p-6">
                <p className="text-xl font-semibold">
                  {player.name || "Unnamed Player"}
                </p>
                <p className="text-gray-300">{player.email}</p>
                <p className="text-gray-400">
                  {player.country || "Country not set"}
                </p>
                <p className="text-green-400 mt-2">Online</p>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}