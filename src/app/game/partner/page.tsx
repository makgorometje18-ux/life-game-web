"use client";

import { useEffect, useMemo, useState } from "react";
import { GameLogo } from "@/components/game-logo";
import { supabase } from "@/lib/supabase";

type Progress = {
  career: "Unemployed" | "Worker" | "Skilled Pro" | "Manager" | "Executive";
  reputation: number;
  spouse: string | null;
  children: number;
  house: "None" | "Starter Home" | "Family House" | "Luxury Estate";
  record: number;
  jailYears: number;
};

type PlayerRecord = {
  id: string;
  name: string | null;
  age: number | null;
  money: number | null;
  health: number | null;
  happiness: number | null;
  education: number | null;
  country: string | null;
};

type Candidate = {
  name: string;
  age: number;
  city: string;
  vibe: string;
  bio: string;
  interests: string[];
  chemistry: number;
  ambition: number;
  loyalty: number;
};

const baseProgress: Progress = {
  career: "Unemployed",
  reputation: 0,
  spouse: null,
  children: 0,
  house: "None",
  record: 0,
  jailYears: 0,
};

const candidates: Candidate[] = [
  {
    name: "Amahle",
    age: 24,
    city: "Cape Town",
    vibe: "Creative strategist",
    bio: "Loves honest conversation, city sunsets, and building something meaningful with the right person.",
    interests: ["Art", "Business", "Travel"],
    chemistry: 84,
    ambition: 73,
    loyalty: 88,
  },
  {
    name: "Neo",
    age: 27,
    city: "Johannesburg",
    vibe: "Calm achiever",
    bio: "Focused, grounded, and serious about relationships that grow with time and effort.",
    interests: ["Fitness", "Finance", "Movies"],
    chemistry: 77,
    ambition: 86,
    loyalty: 79,
  },
  {
    name: "Maya",
    age: 23,
    city: "Durban",
    vibe: "Warm and adventurous",
    bio: "Brings energy into every room and wants a partner who can laugh, dream, and build a future.",
    interests: ["Music", "Cooking", "Beach days"],
    chemistry: 90,
    ambition: 66,
    loyalty: 82,
  },
  {
    name: "Tariq",
    age: 28,
    city: "Pretoria",
    vibe: "Driven mentor",
    bio: "Values purpose, loyalty, and real connection more than surface-level attention.",
    interests: ["Books", "Tech", "Mentoring"],
    chemistry: 74,
    ambition: 91,
    loyalty: 85,
  },
  {
    name: "Lerato",
    age: 25,
    city: "Bloemfontein",
    vibe: "Charming realist",
    bio: "Straightforward, supportive, and ready for a relationship that actually goes somewhere.",
    interests: ["Fashion", "Startups", "Family"],
    chemistry: 81,
    ambition: 78,
    loyalty: 87,
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function PartnerScenePage() {
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [progress, setProgress] = useState<Progress>(baseProgress);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stackIndex, setStackIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const [passed, setPassed] = useState<string[]>([]);
  const [matched, setMatched] = useState<Candidate | null>(null);
  const [status, setStatus] = useState("Swipe through profiles and find someone who truly fits your character.");

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
          .select("id, name, age, money, health, happiness, education, country")
          .eq("id", user.id)
          .single();

        if (playerError || !data) {
          setError(playerError?.message || "Could not open the partner finder.");
          setLoading(false);
          return;
        }

        const stored = window.localStorage.getItem(`life-progress:${user.id}`);
        let extra = baseProgress;

        if (stored) {
          try {
            extra = { ...baseProgress, ...JSON.parse(stored) } as Progress;
          } catch {
            window.localStorage.removeItem(`life-progress:${user.id}`);
          }
        }

        setPlayer(data as PlayerRecord);
        setProgress(extra);
        setLoading(false);
      } catch (loadError) {
        console.error("Partner scene load failed", loadError);
        setError("Could not open the partner finder right now.");
        setLoading(false);
      }
    };

    void loadPlayer();
  }, []);

  const currentCandidate = candidates[stackIndex] ?? null;
  const canUseDating = useMemo(() => {
    if (!player) return false;
    return (player.age ?? 18) >= 22 && (player.money ?? 0) >= 600 && (player.happiness ?? 0) >= 55 && !progress.spouse;
  }, [player, progress.spouse]);

  const advanceStack = () => {
    setStackIndex((value) => value + 1);
  };

  const passCandidate = () => {
    if (!currentCandidate) return;
    setPassed((current) => [...current, currentCandidate.name]);
    setStatus(`You passed on ${currentCandidate.name}. Keep looking for the right person.`);
    advanceStack();
  };

  const likeCandidate = () => {
    if (!currentCandidate || !player) return;

    setLiked((current) => [...current, currentCandidate.name]);

    const compatibility =
      currentCandidate.chemistry * 0.45 +
      currentCandidate.loyalty * 0.35 +
      clamp((player.happiness ?? 0) + (player.education ?? 0) / 2 + progress.reputation / 2, 0, 100) * 0.2;

    if (compatibility >= 72) {
      setMatched(currentCandidate);
      setStatus(`It's a match with ${currentCandidate.name}. You both want something real.`);
      return;
    }

    setStatus(`${currentCandidate.name} liked your vibe, but the spark was not strong enough yet.`);
    advanceStack();
  };

  const makeItOfficial = async () => {
    if (!player || !matched || saving) return;

    setSaving(true);
    setError("");

    const nextProgress = { ...progress, spouse: matched.name };
    const newAge = (player.age ?? 18) + 1;
    const newMoney = Math.max(0, (player.money ?? 500) - 500);
    const newHealth = clamp((player.health ?? 100) - 2, 0, 100);
    const newHappiness = clamp((player.happiness ?? 100) + 18, 0, 100);

    try {
      window.localStorage.setItem(`life-progress:${player.id}`, JSON.stringify(nextProgress));
      window.sessionStorage.setItem(
        `life-game-flash:${player.id}`,
        `Age ${newAge}: you marry ${matched.name} after meeting on the partner finder and begin a new chapter together.`
      );

      const { error: updateError } = await supabase
        .from("players")
        .update({
          age: newAge,
          money: newMoney,
          health: newHealth,
          happiness: newHappiness,
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
      console.error("Partner match save failed", updateError);
      setError("Could not save this match right now. Please try again.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0c0b10] text-white">
        <p className="text-2xl font-semibold">Opening partner finder...</p>
      </main>
    );
  }

  if (error && !player) {
    return (
      <main className="min-h-screen bg-[#0c0b10] px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-rose-300/20 bg-black/50 p-8">
          <p className="text-sm uppercase tracking-[0.35em] text-rose-200">Partner Finder Error</p>
          <h1 className="mt-4 text-4xl font-black">Could not open the partner scene</h1>
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

  if (!canUseDating) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#251724_0%,#0d0b10_45%,#020202_100%)] px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/10 bg-black/45 p-8 shadow-2xl">
          <p className="text-sm uppercase tracking-[0.35em] text-amber-200">Partner Finder Locked</p>
          <h1 className="mt-4 text-4xl font-black">Build more stability first</h1>
          <p className="mt-4 text-lg leading-8 text-stone-300">
            To use this feature like a real dating app, your character must be at least 22 years old, have R600+, happiness above 55, and not already be married.
          </p>
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#251724_0%,#0d0b10_45%,#020202_100%)] px-4 py-6 text-white md:px-8">
      <button
        type="button"
        onClick={() => {
          window.location.href = "/game";
        }}
        className="fixed bottom-4 left-4 z-[70] rounded-full border border-white/15 bg-black/75 px-4 py-3 text-sm font-semibold text-white shadow-xl backdrop-blur transition hover:bg-black/85"
      >
        Back
      </button>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/35 shadow-2xl backdrop-blur">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
            <div>
              <div className="flex items-center gap-4">
                <GameLogo className="h-16 w-16" />
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-stone-400">Partner Finder</p>
                  <h1 className="mt-2 text-4xl font-black tracking-tight md:text-6xl">Find a Partner</h1>
                </div>
              </div>

              <p className="mt-5 max-w-3xl text-base leading-7 text-stone-300 md:text-lg">
                This works like a dating app inside your life game. Swipe through profiles, build a match, and if the connection is strong enough, make the relationship official.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-4 py-2 text-sm font-semibold text-fuchsia-100">Player: {player?.name || "Player"}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-300">Age: {player?.age ?? 18}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-300">Happiness: {player?.happiness ?? 0}/100</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-300">Money: R{player?.money ?? 0}</span>
              </div>

              <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5">
                <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Live Status</p>
                <p className="mt-3 text-lg leading-8 text-stone-100">{status}</p>
                {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Session Stats</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Your dating run</h2>
              <div className="mt-5 grid gap-3 text-sm text-stone-200">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">Liked: {liked.length}</div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">Passed: {passed.length}</div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">Reputation: {progress.reputation}/100</div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">Current Goal: {matched ? `Marry ${matched.name}` : "Find a mutual match"}</div>
              </div>
              {matched ? (
                <button
                  onClick={() => void makeItOfficial()}
                  disabled={saving}
                  className="mt-6 w-full rounded-2xl bg-fuchsia-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving Match..." : `Make It Official With ${matched.name}`}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
            <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Swipe Deck</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Profiles near your vibe</h2>

            {matched ? (
              <div className="mt-6 rounded-[2rem] border border-fuchsia-300/30 bg-fuchsia-400/10 p-6">
                <p className="text-sm uppercase tracking-[0.3em] text-fuchsia-200">It&apos;s a Match</p>
                <h3 className="mt-3 text-4xl font-black text-white">{matched.name}</h3>
                <p className="mt-3 text-base leading-7 text-stone-100">{matched.bio}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {matched.interests.map((interest) => (
                    <span key={interest} className="rounded-full border border-fuchsia-200/20 bg-white/10 px-3 py-1 text-sm text-white">
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            ) : currentCandidate ? (
              <div className="mt-6 rounded-[2rem] border border-white/10 bg-[linear-gradient(160deg,#2a1623_0%,#141018_52%,#0a0a0c_100%)] p-6 shadow-2xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-stone-400">{currentCandidate.city}</p>
                    <h3 className="mt-3 text-4xl font-black text-white">{currentCandidate.name}, {currentCandidate.age}</h3>
                    <p className="mt-2 text-lg text-fuchsia-200">{currentCandidate.vibe}</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-3 text-right text-sm text-stone-300">
                    <p>Card {stackIndex + 1}/{candidates.length}</p>
                  </div>
                </div>

                <p className="mt-6 text-base leading-8 text-stone-100">{currentCandidate.bio}</p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {currentCandidate.interests.map((interest) => (
                    <span key={interest} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-stone-200">
                      {interest}
                    </span>
                  ))}
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-sm text-stone-400">Chemistry</p>
                    <p className="mt-2 text-2xl font-bold text-white">{currentCandidate.chemistry}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-sm text-stone-400">Ambition</p>
                    <p className="mt-2 text-2xl font-bold text-white">{currentCandidate.ambition}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-sm text-stone-400">Loyalty</p>
                    <p className="mt-2 text-2xl font-bold text-white">{currentCandidate.loyalty}</p>
                  </div>
                </div>

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={passCandidate}
                    className="rounded-2xl bg-white/10 px-4 py-4 text-lg font-semibold text-white transition hover:bg-white/20"
                  >
                    Pass
                  </button>
                  <button
                    onClick={likeCandidate}
                    className="rounded-2xl bg-fuchsia-400 px-4 py-4 text-lg font-semibold text-slate-950 transition hover:bg-fuchsia-300"
                  >
                    Like
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-6">
                <p className="text-sm uppercase tracking-[0.3em] text-stone-400">No More Profiles</p>
                <h3 className="mt-3 text-3xl font-bold text-white">That was the full stack</h3>
                <p className="mt-4 text-base leading-7 text-stone-300">
                  No match happened this round. Build your money, happiness, and reputation, then come back and try again.
                </p>
                <button
                  onClick={() => {
                    window.location.href = "/game";
                  }}
                  className="mt-6 rounded-2xl bg-white px-5 py-3 font-semibold text-black"
                >
                  Return to Game
                </button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-400">How It Works</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Dating app rules</h2>
              <div className="mt-5 grid gap-3 text-sm text-stone-200">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Swipe through one profile at a time just like a real dating app.</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Likes can turn into a mutual match if the chemistry is strong enough.</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">A successful match lets you make the relationship official and return to the main story married.</div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Good Match Signals</p>
              <h2 className="mt-2 text-3xl font-bold text-white">What matters</h2>
              <div className="mt-5 grid gap-3 text-sm text-stone-200">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Higher happiness makes your character more attractive in the app.</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Education and reputation improve the quality of mutual matches.</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Money still matters because making a relationship official costs R500.</div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
