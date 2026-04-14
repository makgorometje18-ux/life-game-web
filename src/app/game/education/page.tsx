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

type SessionStats = {
  studyPoints: number;
  attendance: number;
  fatigue: number;
  examReadiness: number;
};

type ZoneId = "library" | "classroom" | "cafeteria";

type Zone = {
  id: ZoneId;
  label: string;
  role: string;
  description: string;
  actionLabel: string;
  result: string;
  cost: number;
  effects: {
    studyPoints: number;
    attendance: number;
    fatigue: number;
    examReadiness: number;
    education: number;
    happiness: number;
    health: number;
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const capeTownQuery = encodeURIComponent("Cape Town CBD, Cape Town, South Africa");
const mapsEmbedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY;
const mapSrc = mapsEmbedKey
  ? `https://www.google.com/maps/embed/v1/place?key=${mapsEmbedKey}&q=${capeTownQuery}&zoom=15&maptype=satellite`
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

const zones: Zone[] = [
  {
    id: "library",
    label: "Library",
    role: "Quiet study zone",
    description: "Stacks of books, calm tables, and a focused environment for serious revision.",
    actionLabel: "Study in Library",
    result: "You settle into the library, revise your notes, and come out sharper for exams.",
    cost: 20,
    effects: {
      studyPoints: 18,
      attendance: 0,
      fatigue: 8,
      examReadiness: 16,
      education: 5,
      happiness: 1,
      health: -1,
    },
  },
  {
    id: "classroom",
    label: "Classroom",
    role: "Lectures and attendance",
    description: "Join the lesson, ask questions, and show up when it matters most.",
    actionLabel: "Attend Class",
    result: "You attend class, impress the lecturer, and build stronger academic momentum.",
    cost: 35,
    effects: {
      studyPoints: 10,
      attendance: 18,
      fatigue: 10,
      examReadiness: 12,
      education: 6,
      happiness: 2,
      health: -2,
    },
  },
  {
    id: "cafeteria",
    label: "Cafeteria",
    role: "Recovery and social energy",
    description: "Recharge, meet students, and steady yourself before pushing into harder work.",
    actionLabel: "Eat and Recharge",
    result: "You grab food, recover some energy, and return to campus feeling more balanced.",
    cost: 25,
    effects: {
      studyPoints: 4,
      attendance: 2,
      fatigue: -12,
      examReadiness: 4,
      education: 2,
      happiness: 8,
      health: 6,
    },
  },
];

export default function EducationScenePage() {
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeZoneId, setActiveZoneId] = useState<ZoneId>("library");
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    studyPoints: 0,
    attendance: 0,
    fatigue: 0,
    examReadiness: 0,
  });
  const [educationGain, setEducationGain] = useState(0);
  const [moneySpent, setMoneySpent] = useState(0);
  const [sessionLog, setSessionLog] = useState<string[]>([
    "You arrive in Cape Town CBD ready to build your future.",
  ]);

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

  const activeZone = zones.find((zone) => zone.id === activeZoneId) ?? zones[0];
  const currentMoney = Math.max(0, (player?.money ?? 0) - moneySpent);
  const currentEducation = clamp((player?.education ?? 0) + educationGain, 0, 100);
  const currentHappiness = clamp((player?.happiness ?? 100) + Math.max(0, 4 - Math.floor(sessionStats.fatigue / 10)), 0, 100);
  const currentHealth = clamp((player?.health ?? 100) - Math.max(0, Math.floor(sessionStats.fatigue / 14)), 0, 100);

  const runZoneAction = (zone: Zone) => {
    if (!player || saving) return;
    if (currentMoney < zone.cost) {
      setError(`You need R${zone.cost} to use ${zone.label} right now.`);
      return;
    }

    setError("");
    setMoneySpent((value) => value + zone.cost);
    setEducationGain((value) => clamp(value + zone.effects.education, 0, 100));
    setSessionStats((current) => ({
      studyPoints: clamp(current.studyPoints + zone.effects.studyPoints, 0, 100),
      attendance: clamp(current.attendance + zone.effects.attendance, 0, 100),
      fatigue: clamp(current.fatigue + zone.effects.fatigue, 0, 100),
      examReadiness: clamp(current.examReadiness + zone.effects.examReadiness, 0, 100),
    }));
    setPlayer((current) =>
      current
        ? {
            ...current,
            happiness: clamp((current.happiness ?? 100) + zone.effects.happiness, 0, 100),
            health: clamp((current.health ?? 100) + zone.effects.health, 0, 100),
          }
        : current
    );
    setSessionLog((current) => [zone.result, ...current].slice(0, 6));
  };

  const finishStudySession = async () => {
    if (!player || saving) return;
    if (moneySpent <= 0) {
      setError("Play at least one campus location before finishing the session.");
      return;
    }

    setSaving(true);
    setError("");

    const readinessBonus = sessionStats.examReadiness >= 35 ? 4 : 0;
    const attendanceBonus = sessionStats.attendance >= 20 ? 2 : 0;
    const fatiguePenalty = Math.floor(sessionStats.fatigue / 20);
    const newAge = (player.age ?? 18) + 1;
    const newMoney = Math.max(0, (player.money ?? 500) - moneySpent);
    const newHealth = clamp((player.health ?? 100) - fatiguePenalty, 0, 100);
    const newHappiness = clamp((player.happiness ?? 100) + (sessionStats.studyPoints >= 20 ? 4 : 1) - fatiguePenalty, 0, 100);
    const newEducation = clamp((player.education ?? 0) + educationGain + readinessBonus + attendanceBonus, 0, 100);

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
                This is now a playable education zone. Move between key campus spaces, build session stats, and only then finish the year.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-100">Location: Cape Town CBD</span>
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100">Player: {player?.name || "Player"}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-300">Education: {currentEducation}/100</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-300">Funds Left: R{currentMoney}</span>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Study Brief</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Session flow</h2>
              <div className="mt-5 space-y-3 text-sm leading-7 text-stone-300">
                <p>Choose a campus zone, perform its action, stack your session stats, then finish the study year.</p>
                <p>Library builds deep study points, Classroom boosts attendance, and Cafeteria helps recovery.</p>
                <p>Balanced sessions lead to stronger education gains before you return to the main game.</p>
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
                  {saving ? "Saving Study Session..." : "Finish Study Year"}
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

            <div className="relative">
              {mapSrc ? (
                <iframe
                  title="Cape Town CBD map"
                  src={mapSrc}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="h-[320px] w-full border-0 sm:h-[380px] lg:h-[500px]"
                  allowFullScreen
                />
              ) : (
                <div className="relative h-[320px] overflow-hidden bg-[linear-gradient(135deg,#1f2d3d_0%,#182029_35%,#0e1319_100%)] sm:h-[380px] lg:h-[500px]">
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

              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(2,6,23,0.75),rgba(2,6,23,0.18)_35%,rgba(2,6,23,0.05)_60%)]" />

              <div className="absolute inset-x-3 bottom-3 hidden gap-3 md:grid-cols-3 lg:inset-x-5 lg:bottom-5 lg:grid">
                {zones.map((zone) => {
                  const isActive = zone.id === activeZoneId;

                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => setActiveZoneId(zone.id)}
                      className={`pointer-events-auto rounded-[1.5rem] border px-4 py-4 text-left backdrop-blur transition ${
                        isActive
                          ? "border-amber-300/70 bg-amber-300/20 shadow-[0_0_0_1px_rgba(252,211,77,0.25)]"
                          : "border-white/15 bg-black/45 hover:bg-black/60"
                      }`}
                    >
                      <p className="text-lg font-bold text-white">{zone.label}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.25em] text-stone-300">{zone.role}</p>
                      <p className="mt-3 text-sm leading-6 text-stone-200">{zone.description}</p>
                      <p className="mt-3 text-sm font-semibold text-amber-200">Cost: R{zone.cost}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 border-t border-white/10 bg-black/40 p-3 md:hidden">
              {zones.map((zone) => {
                const isActive = zone.id === activeZoneId;

                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => setActiveZoneId(zone.id)}
                    className={`rounded-[1.35rem] border px-4 py-3 text-left transition ${
                      isActive
                        ? "border-amber-300/70 bg-amber-300/18 shadow-[0_0_0_1px_rgba(252,211,77,0.2)]"
                        : "border-white/10 bg-white/6"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-white">{zone.label}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.24em] text-stone-300">{zone.role}</p>
                      </div>
                      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-xs font-semibold text-amber-200">
                        R{zone.cost}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-stone-200">{zone.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Active Location</p>
              <h2 className="mt-2 text-3xl font-bold text-white">{activeZone.label}</h2>
              <p className="mt-3 text-sm uppercase tracking-[0.22em] text-amber-200">{activeZone.role}</p>
              <p className="mt-4 text-sm leading-7 text-stone-300">{activeZone.description}</p>
              <div className="mt-5 grid gap-3 text-sm text-stone-200">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Study Points: +{activeZone.effects.studyPoints}</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Attendance: +{activeZone.effects.attendance}</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Exam Readiness: +{activeZone.effects.examReadiness}</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Fatigue: {activeZone.effects.fatigue >= 0 ? `+${activeZone.effects.fatigue}` : activeZone.effects.fatigue}</div>
              </div>
              <button
                type="button"
                onClick={() => runZoneAction(activeZone)}
                className="mt-6 w-full rounded-2xl bg-sky-300 px-4 py-3 font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                {activeZone.actionLabel}
              </button>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Session Progress</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Campus summary</h2>
              <div className="mt-5 grid gap-3 text-sm text-stone-200">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Study Points: {sessionStats.studyPoints}/100</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Attendance: {sessionStats.attendance}/100</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Exam Readiness: {sessionStats.examReadiness}/100</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Fatigue: {sessionStats.fatigue}/100</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Money Spent: R{moneySpent}</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Education Gain So Far: +{educationGain}</div>
              </div>
            </section>

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
              <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Session Log</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Recent campus moments</h2>
              <div className="mt-5 space-y-3">
                {sessionLog.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-stone-200">
                    {entry}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
