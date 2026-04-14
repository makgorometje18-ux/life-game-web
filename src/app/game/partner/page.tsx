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

type DatingProfile = {
  user_id: string;
  display_name: string;
  age: number;
  city: string;
  bio: string;
  interests: string[] | null;
  photo_url: string | null;
  is_active: boolean;
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const schemaHelp = "Dating tables are missing. Run the SQL in supabase/dating_schema.sql, then try again.";

export default function PartnerScenePage() {
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [progress, setProgress] = useState<Progress>(baseProgress);
  const [profiles, setProfiles] = useState<DatingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stackIndex, setStackIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const [passed, setPassed] = useState<string[]>([]);
  const [matched, setMatched] = useState<DatingProfile | null>(null);
  const [status, setStatus] = useState("Swipe through real player profiles and find someone who fits your character.");

  useEffect(() => {
    const loadScene = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/auth";
          return;
        }

        const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("id, name, age, money, health, happiness, education, country")
          .eq("id", user.id)
          .single();

        if (playerError || !playerData) {
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

        const { data: ownProfile, error: ownProfileError } = await supabase
          .from("dating_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (ownProfileError) {
          setError(schemaHelp);
          setLoading(false);
          return;
        }

        if (!ownProfile) {
          window.location.href = "/game/partner/setup";
          return;
        }

        const { data: allProfiles, error: profilesError } = await supabase
          .from("dating_profiles")
          .select("user_id, display_name, age, city, bio, interests, photo_url, is_active")
          .neq("user_id", user.id)
          .eq("is_active", true);

        if (profilesError) {
          setError(schemaHelp);
          setLoading(false);
          return;
        }

        const { data: likesMade, error: likesError } = await supabase
          .from("dating_likes")
          .select("liked_user_id")
          .eq("liker_id", user.id);

        if (likesError) {
          setError(schemaHelp);
          setLoading(false);
          return;
        }

        const likedIds = new Set((likesMade || []).map((row) => row.liked_user_id));
        setPlayer(playerData as PlayerRecord);
        setProgress(extra);
        setProfiles(((allProfiles || []) as DatingProfile[]).filter((profile) => !likedIds.has(profile.user_id)));
        setLiked(Array.from(likedIds));
        setLoading(false);
      } catch (loadError) {
        console.error("Partner scene load failed", loadError);
        setError("Could not open the partner finder right now.");
        setLoading(false);
      }
    };

    void loadScene();
  }, []);

  const currentProfile = profiles[stackIndex] ?? null;
  const canUseDating = useMemo(() => {
    if (!player) return false;
    return (player.age ?? 18) >= 18 && (player.money ?? 0) >= 370 && (player.happiness ?? 0) >= 45 && !progress.spouse;
  }, [player, progress.spouse]);

  const advanceStack = () => setStackIndex((value) => value + 1);

  const passProfile = () => {
    if (!currentProfile) return;
    setPassed((current) => [...current, currentProfile.user_id]);
    setStatus(`You passed on ${currentProfile.display_name}. Keep looking for the right person.`);
    advanceStack();
  };

  const likeProfile = async () => {
    if (!currentProfile || !player) return;
    setSaving(true);
    setError("");

    try {
      const { error: likeError } = await supabase.from("dating_likes").insert({
        liker_id: player.id,
        liked_user_id: currentProfile.user_id,
      });

      if (likeError && !likeError.message.toLowerCase().includes("duplicate")) {
        setError(schemaHelp);
        setSaving(false);
        return;
      }

      setLiked((current) => [...current, currentProfile.user_id]);

      const { data: mutualLike, error: mutualError } = await supabase
        .from("dating_likes")
        .select("liker_id")
        .eq("liker_id", currentProfile.user_id)
        .eq("liked_user_id", player.id)
        .maybeSingle();

      if (mutualError) {
        setError(schemaHelp);
        setSaving(false);
        return;
      }

      if (mutualLike) {
        setMatched(currentProfile);
        setStatus(`It's a match with ${currentProfile.display_name}. You both liked each other.`);
      } else {
        setStatus(`You liked ${currentProfile.display_name}. If they like you too, it will become a match.`);
        advanceStack();
      }
    } catch (likeError) {
      console.error("Dating like failed", likeError);
      setError("Could not save your like right now.");
    } finally {
      setSaving(false);
    }
  };

  const makeItOfficial = async () => {
    if (!player || !matched || saving) return;
    setSaving(true);
    setError("");

    const nextProgress = { ...progress, spouse: matched.display_name };
    const newAge = (player.age ?? 18) + 1;
    const newMoney = Math.max(0, (player.money ?? 500) - 500);
    const newHealth = clamp((player.health ?? 100) - 2, 0, 100);
    const newHappiness = clamp((player.happiness ?? 100) + 18, 0, 100);

    try {
      window.localStorage.setItem(`life-progress:${player.id}`, JSON.stringify(nextProgress));
      window.sessionStorage.setItem(
        `life-game-flash:${player.id}`,
        `Age ${newAge}: you marry ${matched.display_name} after matching in the partner finder and begin a new chapter together.`
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

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#0c0b10] text-white"><p className="text-2xl font-semibold">Opening partner finder...</p></main>;

  if (error && !player) {
    return <main className="min-h-screen bg-[#0c0b10] px-6 py-10 text-white"><div className="mx-auto max-w-3xl rounded-[2rem] border border-rose-300/20 bg-black/50 p-8"><p className="text-sm uppercase tracking-[0.35em] text-rose-200">Partner Finder Error</p><h1 className="mt-4 text-4xl font-black">Could not open the partner scene</h1><p className="mt-4 text-lg text-stone-300">{error}</p><button onClick={() => { window.location.href = "/game"; }} className="mt-8 rounded-2xl bg-white px-5 py-3 font-semibold text-black">Back to Game</button></div></main>;
  }

  if (!canUseDating) {
    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#251724_0%,#0d0b10_45%,#020202_100%)] px-6 py-10 text-white"><div className="mx-auto max-w-3xl rounded-[2rem] border border-white/10 bg-black/45 p-8 shadow-2xl"><p className="text-sm uppercase tracking-[0.35em] text-amber-200">Partner Finder Locked</p><h1 className="mt-4 text-4xl font-black">Build more stability first</h1><p className="mt-4 text-lg leading-8 text-stone-300">To use this feature, your character must be at least 18 years old, have R370+, happiness above 45, and not already be married.</p><button onClick={() => { window.location.href = "/game"; }} className="mt-8 rounded-2xl bg-white px-5 py-3 font-semibold text-black">Back to Game</button></div></main>;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#251724_0%,#0d0b10_45%,#020202_100%)] px-4 py-6 text-white md:px-8">
      <button type="button" onClick={() => { window.location.href = "/game"; }} className="fixed bottom-4 left-4 z-[70] rounded-full border border-white/15 bg-black/75 px-4 py-3 text-sm font-semibold text-white shadow-xl backdrop-blur transition hover:bg-black/85">Back</button>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/35 shadow-2xl backdrop-blur">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
            <div>
              <div className="flex items-center gap-4"><GameLogo className="h-16 w-16" /><div><p className="text-sm uppercase tracking-[0.35em] text-stone-400">Partner Finder</p><h1 className="mt-2 text-4xl font-black tracking-tight md:text-6xl">Find a Partner</h1></div></div>
              <p className="mt-5 max-w-3xl text-base leading-7 text-stone-300 md:text-lg">This now uses real player-created profiles only. Every card here should come from another player who built a dating profile and uploaded a real picture.</p>
              <div className="mt-6 flex flex-wrap gap-3"><span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-4 py-2 text-sm font-semibold text-fuchsia-100">Player: {player?.name || "Player"}</span><span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-300">Age: {player?.age ?? 18}</span><span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-300">Happiness: {player?.happiness ?? 0}/100</span><span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-300">Money: R{player?.money ?? 0}</span></div>
              <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5"><p className="text-sm uppercase tracking-[0.25em] text-stone-400">Live Status</p><p className="mt-3 text-lg leading-8 text-stone-100">{status}</p>{error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}</div>
            </div>
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
              <p className="text-sm uppercase tracking-[0.3em] text-stone-400">Session Stats</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Your dating run</h2>
              <div className="mt-5 grid gap-3 text-sm text-stone-200">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">Liked: {liked.length}</div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">Passed: {passed.length}</div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">Available Profiles: {Math.max(0, profiles.length - stackIndex)}</div>
                <div className="rounded-2xl border border-white/10 bg-black/35 p-4">Current Goal: {matched ? `Marry ${matched.display_name}` : "Find a mutual match"}</div>
              </div>
              <button onClick={() => { window.location.href = "/game/partner/setup"; }} className="mt-6 w-full rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/20">Edit My Dating Profile</button>
              {matched ? <button onClick={() => void makeItOfficial()} disabled={saving} className="mt-3 w-full rounded-2xl bg-fuchsia-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving Match..." : `Make It Official With ${matched.display_name}`}</button> : null}
            </div>
          </div>
        </section>
        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
            <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Swipe Deck</p>
            <h2 className="mt-2 text-3xl font-bold text-white">Real profiles</h2>
            {matched ? (
              <div className="mt-6 rounded-[2rem] border border-fuchsia-300/30 bg-fuchsia-400/10 p-6">
                <p className="text-sm uppercase tracking-[0.3em] text-fuchsia-200">It&apos;s a Match</p>
                <h3 className="mt-3 text-4xl font-black text-white">{matched.display_name}, {matched.age}</h3>
                <p className="mt-3 text-base leading-7 text-stone-100">{matched.bio}</p>
                <div className="mt-5 flex flex-wrap gap-2">{(matched.interests || []).map((interest) => <span key={interest} className="rounded-full border border-fuchsia-200/20 bg-white/10 px-3 py-1 text-sm text-white">{interest}</span>)}</div>
              </div>
            ) : currentProfile ? (
              <div className="mt-6 rounded-[2rem] border border-white/10 bg-[linear-gradient(160deg,#2a1623_0%,#141018_52%,#0a0a0c_100%)] p-6 shadow-2xl">
                <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-black/30"><div className="aspect-[4/5] bg-black/40">{currentProfile.photo_url ? <img src={currentProfile.photo_url} alt={currentProfile.display_name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-center text-stone-400"><div><p className="text-sm uppercase tracking-[0.3em]">No Photo</p><p className="mt-3 text-lg">This player has not uploaded a dating picture yet.</p></div></div>}</div></div>
                <div className="mt-5 flex items-center justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.3em] text-stone-400">{currentProfile.city}</p><h3 className="mt-3 text-4xl font-black text-white">{currentProfile.display_name}, {currentProfile.age}</h3></div><div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-3 text-right text-sm text-stone-300"><p>Card {stackIndex + 1}/{profiles.length}</p></div></div>
                <p className="mt-6 text-base leading-8 text-stone-100">{currentProfile.bio}</p>
                <div className="mt-6 flex flex-wrap gap-2">{(currentProfile.interests || []).map((interest) => <span key={interest} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-stone-200">{interest}</span>)}</div>
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <button onClick={passProfile} className="rounded-2xl bg-white/10 px-4 py-4 text-lg font-semibold text-white transition hover:bg-white/20">Pass</button>
                  <button onClick={() => void likeProfile()} disabled={saving} className="rounded-2xl bg-fuchsia-400 px-4 py-4 text-lg font-semibold text-slate-950 transition hover:bg-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving..." : "Like"}</button>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-6">
                <p className="text-sm uppercase tracking-[0.3em] text-stone-400">No More Profiles</p>
                <h3 className="mt-3 text-3xl font-bold text-white">No real profiles to show right now</h3>
                <p className="mt-4 text-base leading-7 text-stone-300">This partner finder now needs other players to create real dating profiles and upload photos. Once more people join, this deck will become active.</p>
                <button onClick={() => { window.location.href = "/game/partner/setup"; }} className="mt-6 rounded-2xl bg-white px-5 py-3 font-semibold text-black">Complete My Profile</button>
              </div>
            )}
          </div>
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-400">How It Works</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Real-player dating</h2>
              <div className="mt-5 grid gap-3 text-sm text-stone-200">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Players create their own profiles, bios, interests, and upload their own picture.</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">A like becomes a match only if the other player liked you too.</div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">A successful match can become marriage inside the main life game.</div>
              </div>
            </section>
            <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6 shadow-xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Need Setup?</p>
              <h2 className="mt-2 text-3xl font-bold text-white">Create or edit your profile</h2>
              <p className="mt-4 text-base leading-7 text-stone-300">If you want real players instead of fake game-generated accounts, every player needs a real dating profile and a real uploaded photo.</p>
              <button onClick={() => { window.location.href = "/game/partner/setup"; }} className="mt-6 w-full rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/20">Open Dating Profile Setup</button>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
