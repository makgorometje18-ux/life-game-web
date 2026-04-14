"use client";

import { useEffect, useState } from "react";
import { GameLogo } from "@/components/game-logo";
import { supabase } from "@/lib/supabase";

type PlayerRecord = {
  id: string;
  name: string | null;
  email: string | null;
  age: number | null;
  money: number | null;
  health: number | null;
  happiness: number | null;
  education: number | null;
  country: string | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const capeTownQuery = encodeURIComponent("Cape Town CBD, Cape Town, South Africa");
const mapsEmbedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY;
const mapSrc = mapsEmbedKey
  ? `https://www.google.com/maps/embed/v1/place?key=${mapsEmbedKey}&q=${capeTownQuery}&zoom=15`
  : null;

const sceneCharacters = [
  {
    name: "Professor Ndlovu",
    role: "Lecturer",
    text: "Pushes the player into harder choices, stronger thinking, and bigger dreams.",
  },
  {
    name: "Aphiwe",
    role: "Study Partner",
    text: "Helps with notes, revision, and surviving the stress of class deadlines.",
  },
  {
    name: "Mrs. Jacobs",
    role: "Librarian",
    text: "Unlocks books, quiet rooms, and the calm needed to learn properly.",
  },
  {
    name: "Samora",
    role: "Campus Security",
    text: "Keeps the campus safe while students move between classes and the city.",
  },
];

export default function EducationScenePage() {
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadPlayer = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/auth";
          return;
        }

        const { data, error: playerError } = await supabase
          .from("players")
          .select("id, name, email, age, money, health, happiness, education, country")
          .eq("id", user.id)
          .single();

        if (playerError || !data) {
          setError(playerError?.message || "Could not load the education scene.");
          setLoading(false);
          return;
        }

        setPlayer(data as PlayerRecord);
        setLoading(false);
      } catch (loadError) {
        console.error("Education scene load failed", loadError);
        setError("Could not load the education scene. Check your connection and try again.");
        setLoading(false);
      }
    };

    void loadPlayer();
  }, []);

  const finishStudySession = async () => {
    if (!player || saving) return;
    if ((player.money ?? 0) < 120) {
      setError("You need at least R120 before you can study in this scene.");
      return;
    }

    setSaving(true);
    setError("");

    const newAge = (player.age ?? 18) + 1;
    const newMoney = Math.max(0, (player.money ?? 500) - 120);
    const newHealth = clamp((player.health ?? 100) - 3, 0, 100);
    const newHappiness = clamp((player.happiness ?? 100) - 2, 0, 100);
    const newEducation = clamp((player.education ?? 0) + ((player.age ?? 18) < 18 ? 14 : 10), 0, 100);

    try {
      const { error: updateError } = await supabase
        .from("players")
        .update({
          age: newAge,
          money: newMoney,
          health: newHealth,
          happiness: newHappiness,
          education: newEducation,
          updated_at: new Date().toISOString(),
        })
        .eq("id", player.id);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      window.location.href = "/game";
    } catch (updateError) {
      console.error("Study session save failed", updateError);
      setError("Could not save your study session. Please try again.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0b0b] text-white">
        <p className="text-2xl font-semibold">Opening Cape Town CBD campus...</p>
      </main>
    );
  }

  if (error && !player) {
    return (
      <main className="min-h-screen bg-[#0b0b0b] px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-rose-300/20 bg-black/50 p-8">
          <p className="text-sm uppercase tracking-[0.35em] text-rose-200">Education Scene Error</p>
          <h1 className="mt-4 text-4xl font-black">Could not open the study scene</h1>
          <p className="mt-4 text-lg text-stone-300">{error}</p>
          <button
            onClick={() => {
              window.location.href = "/game";
            }}
            className="mt-8 rounded-2xl bg-white px-5 py-3 font-semibold text-black"
          >
            Back to Game
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1d2128_0%,#0b0c0f_40%,#030303_100%)] px-4 py-6 text-white md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/35 shadow-2xl backdrop-blur">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
            <div>
              <div className="flex items-center gap-4">
                <GameLogo className="h-16 w-16" />
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-stone-400">Education Scene</p>
                  <h1 className="mt-2 text-4xl font-black tracking-tight md:text-6xl">Cape Town CBD Campus</h1>
                </div>
              </div>

              <p className="mt-5 max-w-3xl text-base leading-7 text-stone-300 md:text-lg">
                This is the first playable education world. The player leaves the choice card, enters a city-based study scene, and learns inside a real South African location.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-100">Location: Cape Town CBD</span>
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100">Player: {player?.name || "Player"}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-300">Education: {player?.education ?? 0}/100</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-300">Funds: R{player?.money ?? 0}</span>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Study Brief</p>
              <h2 className="mt-3 text-3xl font-bold text-white">What happens here</h2>
              <div className="mt-5 space-y-3 text-sm leading-7 text-stone-300">
                <p>You move through a city campus, meet study characters, and invest in your future.</p>
                <p>Completing this session costs R120, increases education, and moves one year forward.</p>
                <p>This scene is ready for real Google Maps city backgrounds and more playable interactions.</p>
              </div>
              {error ? <p className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => {
                    window.location.href = "/game";
                  }}
                  className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/20"
                >
                  Back to Game
                </button>
                <button
                  onClick={() => void finishStudySession()}
                  disabled={saving}
                  className="rounded-2xl bg-amber-300 px-4 py-3 font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving Study Session..." : "Complete Study Session"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/35 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Map Background</p>
                <h2 className="mt-2 text-3xl font-bold text-white">Cape Town CBD</h2>
              </div>
              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">
                Real City Layer
              </span>
            </div>

            {mapSrc ? (
              <iframe
                title="Cape Town CBD map"
                src={mapSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-[460px] w-full border-0"
                allowFullScreen
              />
            ) : (
              <div className="relative h-[460px] overflow-hidden bg-[linear-gradient(135deg,#1f2d3d_0%,#182029_35%,#0e1319_100%)]">
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:54px_54px]" />
                <div className="absolute left-[10%] top-[14%] h-40 w-22 rounded-[2rem] bg-white/10" />
                <div className="absolute left-[28%] top-[18%] h-56 w-28 rounded-[2rem] bg-white/7" />
                <div className="absolute left-[48%] top-[10%] h-72 w-32 rounded-[2rem] bg-white/10" />
                <div className="absolute left-[70%] top-[22%] h-52 w-24 rounded-[2rem] bg-white/8" />
                <div className="absolute bottom-[18%] left-[8%] right-[8%] h-8 rounded-full bg-white/5" />
                <div className="absolute left-[18%] top-[56%] h-5 w-5 rounded-full bg-amber-300 shadow-[0_0_0_10px_rgba(252,211,77,0.15)]" />
                <div className="absolute bottom-8 left-8 max-w-lg rounded-[2rem] border border-white/10 bg-black/45 p-6 backdrop-blur">
                  <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Google Maps Ready</p>
                  <h3 className="mt-3 text-2xl font-bold text-white">Add Cape Town CBD live map</h3>
                  <p className="mt-3 text-sm leading-7 text-stone-300">
                    This scene is ready for a real Google Maps Embed API background. Add `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` to `.env.local` and Vercel, then this panel will switch to the live Cape Town CBD map.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Scene Cast</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Characters on campus</h2>
              <div className="mt-5 space-y-3">
                {sceneCharacters.map((character) => (
                  <div key={character.name} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-lg font-bold text-white">{character.name}</p>
                    <p className="text-sm uppercase tracking-[0.22em] text-amber-200">{character.role}</p>
                    <p className="mt-2 text-sm leading-7 text-stone-300">{character.text}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Next Build</p>
              <h2 className="mt-2 text-3xl font-bold text-white">What we can add next</h2>
              <div className="mt-5 grid gap-3 text-sm text-stone-200">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Walkable city background with animated NPCs</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Classroom, library, and residence sub-scenes</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Education mini-games, exams, and scholarship choices</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">More South African city locations after Cape Town CBD</div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
