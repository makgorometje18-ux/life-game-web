"use client";

import { useEffect, useState } from "react";
import { GameLogo } from "@/components/game-logo";
import { requestNotificationPermission, showSystemNotification } from "@/lib/browser-notifications";
import { supabase } from "@/lib/supabase";

type PlayerUpdates = {
  age?: number;
  money?: number;
  health?: number;
  happiness?: number;
  education?: number;
};

type Career = "Unemployed" | "Worker" | "Skilled Pro" | "Manager" | "Executive";
type House = "None" | "Starter Home" | "Family House" | "Luxury Estate";

type Progress = {
  career: Career;
  reputation: number;
  spouse: string | null;
  children: number;
  house: House;
  record: number;
  jailYears: number;
};

type Action = {
  title: string;
  text: string;
  label: string;
  tone?: "gold" | "sky" | "rose";
  disabled?: boolean;
  run: () => Promise<void>;
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

const careers: Career[] = ["Unemployed", "Worker", "Skilled Pro", "Manager", "Executive"];
const houses: House[] = ["None", "Starter Home", "Family House", "Luxury Estate"];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lifeStage = (age: number) =>
  age < 13 ? "Childhood" : age < 20 ? "Teen Years" : age < 36 ? "Young Adult" : age < 61 ? "Prime Years" : "Legacy Era";
const meterTone = (value: number) => (value >= 75 ? "bg-emerald-400" : value >= 45 ? "bg-amber-400" : "bg-rose-500");
const incomeFor = (career: Career, education: number) =>
  ({ Unemployed: 280, Worker: 550, "Skilled Pro": 950, Manager: 1500, Executive: 2400 }[career] ?? 280) +
  (education >= 80 ? 300 : education >= 50 ? 150 : 0);
const houseCost = (house: House) => ({ None: 2500, "Starter Home": 6000, "Family House": 12000, "Luxury Estate": 0 }[house] ?? 0);

export default function GamePage() {
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("Player");
  const [country, setCountry] = useState("Unknown");
  const [age, setAge] = useState(18);
  const [money, setMoney] = useState(500);
  const [health, setHealth] = useState(100);
  const [happiness, setHappiness] = useState(100);
  const [education, setEducation] = useState(0);
  const [eventMessage, setEventMessage] = useState("Welcome to your life journey.");
  const [history, setHistory] = useState<string[]>(["Your story begins. Build a life you can be proud of."]);
  const [progress, setProgress] = useState<Progress>(baseProgress);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const isGameOver = health <= 0 || happiness <= 0;
  const isLegend = age >= 75 && !isGameOver;
  const inJail = progress.jailYears > 0;
  const wealth = money >= 15000 ? "Elite" : money >= 5000 ? "Thriving" : money >= 1500 ? "Stable" : "Fragile";
  const progressKey = playerId ? `life-progress:${playerId}` : "";

  const pushHistory = (message: string) => setHistory((current) => [message, ...current].slice(0, 10));
  const persistProgress = (next: Progress) => {
    if (progressKey) window.localStorage.setItem(progressKey, JSON.stringify(next));
    setProgress(next);
  };

  const loadPlayer = async () => {
    try {
      setLoadError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/auth";
        return;
      }

      setPlayerId(user.id);

      const { data, error } = await supabase.from("players").select("*").eq("id", user.id).single();
      if (error || !data) {
        setEventMessage("Could not load player profile.");
        setLoadError(error?.message || "Player profile missing.");
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

      const intro = `${data.name || "Player"} is ${data.age ?? 18} years old in ${data.country || "Unknown"}. Your next choice shapes everything.`;
      const flashKey = `life-game-flash:${user.id}`;
      const flashMessage = window.sessionStorage.getItem(flashKey);

      setName(data.name || "Player");
      setCountry(data.country || "Unknown");
      setAge(data.age ?? 18);
      setMoney(data.money ?? 500);
      setHealth(data.health ?? 100);
      setHappiness(data.happiness ?? 100);
      setEducation(data.education ?? 0);
      setProgress(extra);
      setEventMessage(flashMessage || intro);
      setHistory(flashMessage ? [flashMessage, intro, "Your story begins. Build a life you can be proud of."] : [intro, "Your story begins. Build a life you can be proud of."]);
      if (flashMessage) window.sessionStorage.removeItem(flashKey);
      setLoading(false);
    } catch (error) {
      console.error("Failed to load player", error);
      setLoadError("Could not reach Supabase. Check your internet and refresh.");
      setEventMessage("The game could not load your player data.");
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPlayer(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (Notification.permission === "default") {
      void requestNotificationPermission();
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !playerId || Notification.permission !== "granted") return;

    let reminderTimer: number | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        reminderTimer = window.setTimeout(() => {
          void showSystemNotification({
            title: `${name}'s story is waiting`,
            body: `You left off at age ${age}. Come back and continue your character's life.`,
            url: "/game",
            tag: `life-reminder-${playerId}`,
          });
        }, 90000);
      } else if (reminderTimer) {
        window.clearTimeout(reminderTimer);
        reminderTimer = null;
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (reminderTimer) window.clearTimeout(reminderTimer);
    };
  }, [age, name, playerId]);

  const savePlayer = async (updates: PlayerUpdates) => {
    if (!playerId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("players")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", playerId);

      if (error) {
        console.error("Failed to save player", error);
        setEventMessage(`Save failed: ${error.message}`);
        pushHistory(`Save failed: ${error.message}`);
      }
    } catch (error) {
      console.error("Failed to save player", error);
      setEventMessage("Save failed because the network request could not complete.");
      pushHistory("Save failed because the network request could not complete.");
    }
    setSaving(false);
  };

  const yearEvent = (nextAge: number, record: number) => {
    const roll = Math.random();
    if (record > 0 && roll < 0.15) return { money: -300, health: -5, happiness: -8, education: 0, text: "Your criminal past follows you and costs you this year." };
    if (nextAge < 13) return roll < 0.5
      ? { money: 100, health: 0, happiness: 4, education: 2, text: "A supportive adult helps you dream bigger." }
      : { money: 0, health: -5, happiness: -3, education: 0, text: "A rough illness slows you down this year." };
    if (nextAge < 20) return roll < 0.5
      ? { money: 160, health: 0, happiness: 6, education: 4, text: "A good opportunity gives you confidence." }
      : { money: -120, health: -5, happiness: -8, education: 0, text: "Stress and pressure make the year difficult." };
    if (nextAge < 40) return roll < 0.5
      ? { money: 500, health: 0, happiness: 6, education: 0, text: "A breakthrough opens new doors for you." }
      : { money: -350, health: -8, happiness: -9, education: 0, text: "Bills and pressure hit hard this year." };
    if (nextAge < 60) return roll < 0.5
      ? { money: 850, health: 0, happiness: 5, education: 0, text: "Your experience finally pays off." }
      : { money: -400, health: -12, happiness: -6, education: 0, text: "A demanding year drains your strength." };
    return roll < 0.5
      ? { money: 300, health: 5, happiness: 10, education: 0, text: "Your wisdom inspires people around you." }
      : { money: -500, health: -14, happiness: -7, education: 0, text: "Age catches up and recovery becomes harder." };
  };

  const applyYear = async (
    actionLabel: string,
    delta: { money?: number; health?: number; happiness?: number; education?: number },
    nextProgress = progress,
    skipEvent = false,
    suffix = ""
  ) => {
    if (saving || isGameOver) return;

    if (nextProgress.jailYears > 0) {
      const released = { ...nextProgress, jailYears: nextProgress.jailYears - 1 };
      const newAge = age + 1;
      const newMoney = Math.max(0, money - 120);
      const newHealth = clamp(health - 4, 0, 100);
      const newHappiness = clamp(happiness - 12, 0, 100);
      const message =
        released.jailYears > 0
          ? `Age ${newAge}: you spend another year in jail. ${released.jailYears} year(s) remain.`
          : `Age ${newAge}: you complete your jail sentence and step back into freedom.`;

      setAge(newAge);
      setMoney(newMoney);
      setHealth(newHealth);
      setHappiness(newHappiness);
      setEventMessage(message);
      pushHistory(message);
      persistProgress(released);
      await savePlayer({ age: newAge, money: newMoney, health: newHealth, happiness: newHappiness, education });
      return;
    }

    const nextAge = age + 1;
    const extra = skipEvent ? { money: 0, health: 0, happiness: 0, education: 0, text: "" } : yearEvent(nextAge, nextProgress.record);
    const newMoney = Math.max(0, money + (delta.money ?? 0) + extra.money);
    const newHealth = clamp(health - 2 + (delta.health ?? 0) + extra.health, 0, 100);
    const newHappiness = clamp(happiness - 1 + (delta.happiness ?? 0) + extra.happiness, 0, 100);
    const newEducation = clamp(education + (delta.education ?? 0) + extra.education, 0, 100);

    let message = `Age ${nextAge}: ${actionLabel}${extra.text ? ` ${extra.text}` : ""}${suffix ? ` ${suffix}` : ""}`;
    if (newHealth <= 0) message = `Age ${nextAge}: your body gives out after a brutal year. Your journey ends here.`;
    if (newHappiness <= 0) message = `Age ${nextAge}: the weight of life becomes too much and your spirit collapses. Your journey ends here.`;
    if (nextAge >= 75 && age < 75 && newHealth > 0 && newHappiness > 0) message = `Age ${nextAge}: ${actionLabel} You have become a living legend.`;

    setAge(nextAge);
    setMoney(newMoney);
    setHealth(newHealth);
    setHappiness(newHappiness);
    setEducation(newEducation);
    setEventMessage(message);
    pushHistory(message);
    persistProgress(nextProgress);
    await savePlayer({ age: nextAge, money: newMoney, health: newHealth, happiness: newHappiness, education: newEducation });
  };

  const sayNo = (message: string) => {
    setEventMessage(message);
    pushHistory(message);
  };

  const study = async () => {
    if (money < 120) {
      sayNo("You cannot afford tuition right now.");
      return;
    }

    window.location.href = "/game/education";
  };
  const rest = async () => applyYear("You choose peace, healing, and time for yourself.", { money: -80, health: 15, happiness: 14 });
  const doctor = async () => (money < 180 ? sayNo("You cannot afford treatment yet.") : applyYear("You pay for treatment and recovery.", { money: -180, health: 20, happiness: 4 }));

  const work = async () => {
    if (age < 16) return sayNo("You are still too young to enter the job market.");
    const idx = careers.indexOf(progress.career);
    const promote = idx < careers.length - 1 && education >= idx * 18 + 18 && progress.reputation >= idx * 12 + 6 && Math.random() > 0.45;
    const career = progress.career === "Unemployed" ? "Worker" : promote ? careers[idx + 1] : progress.career;
    const next = { ...progress, career, reputation: clamp(progress.reputation + 8, 0, 100) };
    await applyYear(promote ? `You earn a promotion to ${career}.` : `You commit to work as a ${career}.`, { money: incomeFor(career, education), health: -4, happiness: career === "Executive" ? 6 : 2 }, next);
  };

  const hustle = async () => {
    if (money < 250) return sayNo("You need at least R250 to take a real shot at business.");
    const roll = Math.random();
    const next = { ...progress, reputation: clamp(progress.reputation + (roll < 0.35 ? 0 : roll < 0.75 ? 6 : 10), 0, 100) };
    if (roll < 0.35) return applyYear("Your business gamble backfires.", { money: -250, health: -5, happiness: -8 }, next);
    if (roll < 0.75) return applyYear("Your hustle survives and starts earning respect.", { money: 500, health: -3, happiness: 6 }, next);
    return applyYear("Your business explodes with momentum.", { money: 1400, health: -2, happiness: 12 }, next);
  };

  const buyHouse = async () => {
    const idx = houses.indexOf(progress.house);
    if (idx === houses.length - 1) return sayNo("You already own the best house available.");
    const cost = houseCost(progress.house);
    if (money < cost) return sayNo(`You need R${cost} to buy your next house.`);
    const next = { ...progress, house: houses[idx + 1] };
    await applyYear(`You buy a ${next.house}.`, { money: -cost, happiness: 12, health: 2 }, next);
  };

  const marry = async () => {
    if (progress.spouse) return sayNo(`You are already married to ${progress.spouse}.`);
    if (age < 18) return sayNo("You want more time before settling down.");
    if (money < 370 || happiness < 45) return sayNo("Dating feels out of reach. Build a little more confidence and money first.");
    window.location.href = "/game/partner";
  };

  const children = async () => {
    if (!progress.spouse) return sayNo("You need a partner before growing your family.");
    if (age < 22 || age > 55) return sayNo("This stage of life is not the right window for children.");
    if (money < 700) return sayNo("You need more money before taking on that responsibility.");
    const next = { ...progress, children: progress.children + 1 };
    await applyYear(`You welcome child number ${next.children} into the family.`, { money: -650, happiness: 16, health: -3 }, next, false, next.house === "None" ? "A bigger home may soon become necessary." : "");
  };

  const crime = async () => {
    if (age < 14) return sayNo("You are too young to step into serious crime.");
    const roll = Math.random();
    if (roll < 0.34) {
      const sentence = Math.random() < 0.5 ? 1 : 2;
      const next = { ...progress, record: progress.record + 1, jailYears: sentence };
      return applyYear("Your crime fails and the police catch you.", { money: -250, health: -10, happiness: -16 }, next, true, `You are sentenced to ${sentence} year(s) in jail.`);
    }
    const next = { ...progress, record: progress.record + 1 };
    if (roll < 0.74) return applyYear("You pull off a risky crime and get away with it.", { money: 950, happiness: 3, health: -5 }, next);
    return applyYear("You execute a major crime and score a huge payout.", { money: 2200, happiness: 6, health: -8 }, next);
  };

  const serveSentence = async () => applyYear("You try to survive prison life.", {}, progress, true);

  const logout = async () => {
    if (playerId) {
      await supabase
        .from("players")
        .update({ is_online: false, updated_at: new Date().toISOString() })
        .eq("id", playerId);
    }

    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const restart = async () => {
    if (playerId) {
      window.localStorage.removeItem(`life-progress:${playerId}`);
      await supabase.from("players").update({ is_online: false, updated_at: new Date().toISOString() }).eq("id", playerId);
    }
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const actions: Action[] = inJail
    ? [
        { title: "Prison Year", text: "Serve your sentence and hope to rebuild after release.", label: `Serve ${progress.jailYears} Year(s)`, tone: "rose", run: serveSentence },
        { title: "Recovery", text: "Keep your mind and body from collapsing in prison.", label: "Endure and Rest", tone: "sky", run: rest },
      ]
    : [
        { title: "Advance Year", text: "Let life move forward and see what comes next.", label: "Live the Next Year", run: async () => applyYear("You keep moving forward.", {}) },
        { title: "Education", text: "Spend money to build your future.", label: "Study Hard", disabled: age < 6, run: study },
        { title: "Career", text: "Work, earn money, and rise through career levels.", label: "Work This Year", tone: "sky", disabled: age < 16, run: work },
        { title: "Business", text: "Take a risk for bigger rewards.", label: "Build a Hustle", run: hustle },
        { title: "Buy House", text: "Upgrade your life with property.", label: "Buy Property", run: buyHouse },
        { title: "Get Married", text: "Settle down when you are stable enough.", label: "Find a Partner", disabled: Boolean(progress.spouse), run: marry },
        { title: "Have Children", text: "Grow your family and your responsibilities.", label: "Grow Family", disabled: !progress.spouse, run: children },
        { title: "Crime", text: "High risk, high reward, possible jail.", label: "Commit Crime", tone: "rose", run: crime },
        { title: "Recovery", text: "Slow down and heal.", label: "Take a Break", tone: "sky", run: rest },
        { title: "Healthcare", text: "Pay for proper treatment.", label: "Visit Doctor", run: doctor },
      ];

  if (loading) return <main className="min-h-screen bg-[#120f08] text-white flex items-center justify-center"><p className="text-2xl font-semibold">Loading your life...</p></main>;

  if (loadError) {
    return (
      <main className="min-h-screen bg-[#120f08] px-6 py-10 text-white">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-rose-300/20 bg-black/40 p-8 shadow-2xl">
          <p className="text-sm uppercase tracking-[0.3em] text-rose-200">Load Error</p>
          <h1 className="mt-3 text-4xl font-black">Could not open the game</h1>
          <p className="mt-4 text-lg leading-8 text-stone-200">{loadError}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => window.location.reload()}
              className="rounded-2xl bg-amber-300 px-5 py-3 font-semibold text-stone-950"
            >
              Refresh Game
            </button>
            <button
              onClick={() => {
                window.location.href = "/auth";
              }}
              className="rounded-2xl bg-white/10 px-5 py-3 font-semibold text-white"
            >
              Back to Login
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#04111c] px-4 py-8 text-stone-100 md:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[url('/game-start-background.jpeg')] bg-cover bg-center" />

      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,9,16,0.12)_0%,rgba(1,7,13,0.58)_54%,rgba(0,0,0,0.92)_100%)]" />

      {isGameOver ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-rose-300/20 bg-[#1b120d] p-8 shadow-2xl">
            <p className="text-sm uppercase tracking-[0.3em] text-rose-200">Game Over</p>
            <h2 className="mt-3 text-4xl font-black text-white">Your story has ended</h2>
            <p className="mt-4 text-lg leading-8 text-stone-200">
              You reached age {age}, built R{money}, became a {progress.career}, raised {progress.children} child{progress.children === 1 ? "" : "ren"}, and ended with {progress.house}.
            </p>
            <button onClick={() => void restart()} className="mt-8 w-full rounded-2xl bg-rose-500 px-4 py-4 text-lg font-semibold text-white transition hover:bg-rose-400">Restart This Life</button>
          </div>
        </div>
      ) : null}

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/35 shadow-2xl backdrop-blur">
          <div className="grid gap-6 p-6 md:grid-cols-[1.45fr_0.95fr] md:p-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-4 py-1 text-sm font-semibold text-sky-100">Build In Progress</span>
                <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-1 text-sm font-semibold text-amber-100">{lifeStage(age)}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-sm text-stone-300">{country}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-sm text-stone-300">Wealth: {wealth}</span>
                {isLegend ? <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-1 text-sm font-semibold text-emerald-100">Living Legend</span> : null}
                {inJail ? <span className="rounded-full border border-rose-300/30 bg-rose-400/10 px-4 py-1 text-sm font-semibold text-rose-100">In Jail: {progress.jailYears} Year(s)</span> : null}
              </div>

              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-stone-400">Life Simulator</p>
                <div className="mt-3 flex items-center gap-4">
                  <GameLogo className="hidden h-16 w-16 text-white md:block" />
                  <h1 className="text-4xl font-black tracking-tight text-white md:text-6xl">{name}&apos;s Story</h1>
                </div>
                <p className="mt-3 max-w-2xl text-base leading-7 text-stone-300 md:text-lg">
                  Build wealth, climb career levels, buy property, build a family, avoid prison, and leave a legacy.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-stone-400">Latest Event</p>
                <p className="mt-3 text-lg leading-8 text-stone-100">{eventMessage}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-stone-400">Current Snapshot</p>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-black/40 p-4"><p className="text-sm text-stone-400">Age</p><p className="mt-1 text-3xl font-bold">{age}</p></div>
                <div className="rounded-2xl bg-black/40 p-4"><p className="text-sm text-stone-400">Money</p><p className="mt-1 text-3xl font-bold">R{money}</p></div>
                <div className="col-span-2 rounded-2xl bg-black/40 p-4"><div className="flex items-center justify-between text-sm text-stone-300"><span>Health</span><span>{health}/100</span></div><div className="mt-3 h-3 rounded-full bg-white/10"><div className={`h-3 rounded-full ${meterTone(health)}`} style={{ width: `${health}%` }} /></div></div>
                <div className="col-span-2 rounded-2xl bg-black/40 p-4"><div className="flex items-center justify-between text-sm text-stone-300"><span>Happiness</span><span>{happiness}/100</span></div><div className="mt-3 h-3 rounded-full bg-white/10"><div className={`h-3 rounded-full ${meterTone(happiness)}`} style={{ width: `${happiness}%` }} /></div></div>
                <div className="col-span-2 rounded-2xl bg-black/40 p-4"><div className="flex items-center justify-between text-sm text-stone-300"><span>Education</span><span>{education}/100</span></div><div className="mt-3 h-3 rounded-full bg-white/10"><div className="h-3 rounded-full bg-sky-400" style={{ width: `${education}%` }} /></div></div>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-stone-300">{saving ? "Saving your progress..." : "Progress synced to your account."}</div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
            <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Choices</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Control the next chapter</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {actions.map((action) => {
                const tone =
                  action.tone === "rose" ? "bg-rose-400 text-white hover:bg-rose-300" :
                  action.tone === "sky" ? "bg-sky-300 text-slate-950 hover:bg-sky-200" :
                  "bg-amber-300 text-stone-950 hover:bg-amber-200";

                return (
                  <div key={action.title} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <h3 className="text-xl font-bold text-white">{action.title}</h3>
                    <p className="mt-2 min-h-16 text-sm leading-6 text-stone-300">{action.text}</p>
                    <button
                      onClick={() => void action.run()}
                      disabled={isGameOver || saving || action.disabled}
                      className={`mt-4 w-full rounded-2xl px-4 py-3 font-semibold transition disabled:cursor-not-allowed disabled:bg-stone-600 disabled:text-stone-300 ${tone}`}
                    >
                      {action.label}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Life Progress</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Legacy Tracker</h2>
              <div className="mt-5 grid gap-3 text-sm text-stone-200">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Career Level: {progress.career}</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Reputation: {progress.reputation}/100</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Marriage: {progress.spouse ? `Married to ${progress.spouse}` : "Single"}</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Children: {progress.children}</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">House: {progress.house}</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Criminal Record: {progress.record}</div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Timeline</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Recent History</h2>
              <div className="mt-5 space-y-3">
                {history.map((entry, index) => (
                  <div key={`${entry}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-stone-200">{entry}</div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Session Control</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Leave or restart</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button onClick={() => void logout()} className="w-full rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/20">Logout</button>
                <button onClick={() => void restart()} className="w-full rounded-2xl bg-rose-500 px-4 py-3 font-semibold text-white transition hover:bg-rose-400">Restart Life</button>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
