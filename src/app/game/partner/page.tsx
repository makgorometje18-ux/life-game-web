"use client";

import { useEffect, useMemo, useState } from "react";
import { GameLogo } from "@/components/game-logo";
import { requestNotificationPermission, showSystemNotification } from "@/lib/browser-notifications";
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
  gallery_urls: string[] | null;
  gender: string | null;
  relationship_goal: string | null;
  location_label: string | null;
  profile_verified: boolean;
  is_photo_verified: boolean;
  selfie_url: string | null;
  is_active: boolean;
  onboarding_complete: boolean;
};

type MatchRow = {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type AppTab = "swipe" | "explore" | "likes" | "chat" | "profile";

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
const srdGrantAmount = 370;
const moneyLabelFor = (amount: number) => (amount <= srdGrantAmount ? "SASSA SRD Grant" : "Wallet Balance");
const schemaHelp = "Dating tables are missing or outdated. Run the latest SQL in supabase/dating_schema.sql, then try again.";
const sortPair = (first: string, second: string) => (first < second ? [first, second] : [second, first]);
const goalPalette = ["from-rose-500/80 to-orange-400/80", "from-fuchsia-700/80 to-purple-500/80", "from-amber-400/80 to-yellow-500/80"];
const summaryKey = (userId: string) => `dating-notification-summary:${userId}`;
const isProfileVerified = (profile?: Pick<DatingProfile, "profile_verified" | "is_photo_verified" | "selfie_url">) =>
  Boolean(profile?.profile_verified && profile.is_photo_verified && profile.selfie_url);

export default function PartnerScenePage() {
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [progress, setProgress] = useState<Progress>(baseProgress);
  const [profiles, setProfiles] = useState<DatingProfile[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, DatingProfile>>({});
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [likedMeIds, setLikedMeIds] = useState<string[]>([]);
  const [passedIds, setPassedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Swipe, explore, match, and chat with real player profiles.");
  const [activeTab, setActiveTab] = useState<AppTab>("swipe");
  const [stackIndex, setStackIndex] = useState(0);
  const [activeMatchId, setActiveMatchId] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [isLightMode, setIsLightMode] = useState(false);
  const playerMoney = player?.money ?? 0;
  const moneyLabel = moneyLabelFor(playerMoney);

  const loadScene = async (preserveMatchId?: string) => {
    try {
      setError("");
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
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (ownProfileError) {
        setError(schemaHelp);
        setLoading(false);
        return;
      }

      if (!ownProfile || !ownProfile.onboarding_complete) {
        window.location.href = "/game/partner/setup";
        return;
      }

      const { data: allProfiles, error: profilesError } = await supabase
        .from("dating_profiles")
        .select("*")
        .neq("user_id", user.id)
        .eq("onboarding_complete", true);

      if (profilesError) {
        setError(schemaHelp);
        setLoading(false);
        return;
      }

      const { data: likesMade, error: likesError } = await supabase.from("dating_likes").select("liked_user_id").eq("liker_id", user.id);
      const { data: likesReceived, error: likesReceivedError } = await supabase.from("dating_likes").select("liker_id").eq("liked_user_id", user.id);
      const { data: matchRows, error: matchError } = await supabase
        .from("dating_matches")
        .select("id, user_a, user_b, created_at")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (likesError || likesReceivedError || matchError) {
        setError(schemaHelp);
        setLoading(false);
        return;
      }

      const typedMatches = (matchRows || []) as MatchRow[];
      const partnerIds = typedMatches.map((row) => (row.user_a === user.id ? row.user_b : row.user_a));
      const visibleProfiles = ((allProfiles || []) as DatingProfile[]).filter((profile) => profile.is_active ?? true);
      const mergedProfiles = [...visibleProfiles, ownProfile as DatingProfile];
      const missingIds = partnerIds.filter((id) => !mergedProfiles.some((profile) => profile.user_id === id));
      let matchedProfiles: DatingProfile[] = [];

      if (missingIds.length) {
        const { data: fetchedProfiles } = await supabase
          .from("dating_profiles")
          .select("*")
          .in("user_id", missingIds);
        matchedProfiles = (fetchedProfiles || []) as DatingProfile[];
      }

      const nextMap = [...mergedProfiles, ...matchedProfiles].reduce<Record<string, DatingProfile>>((accumulator, profile) => {
        accumulator[profile.user_id] = profile;
        return accumulator;
      }, {});

      const matchIds = typedMatches.map((row) => row.id);
      let messageRows: MessageRow[] = [];
      if (matchIds.length) {
        const { data: fetchedMessages, error: messageError } = await supabase
          .from("dating_messages")
          .select("id, match_id, sender_id, body, created_at, read_at")
          .in("match_id", matchIds)
          .order("created_at", { ascending: true });
        if (messageError) {
          setError(schemaHelp);
          setLoading(false);
          return;
        }
        messageRows = (fetchedMessages || []) as MessageRow[];
      }

      const nextLikedIds = (likesMade || []).map((row) => row.liked_user_id);
      setPlayer(playerData as PlayerRecord);
      setProgress(extra);
      setProfiles(((allProfiles || []) as DatingProfile[]).filter((profile) => !nextLikedIds.includes(profile.user_id)));
      setProfileMap(nextMap);
      setMatches(typedMatches);
      setMessages(messageRows);
      setLikedIds(nextLikedIds);
      setLikedMeIds((likesReceived || []).map((row) => row.liker_id));
      setActiveMatchId((current) => preserveMatchId || current || typedMatches[0]?.id || "");
      setLoading(false);
    } catch (loadError) {
      console.error("Partner scene load failed", loadError);
      setError("Could not open the partner finder right now.");
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadScene();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "swipe" || tab === "explore" || tab === "likes" || tab === "chat" || tab === "profile") {
      setActiveTab(tab);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !player) return;

    if (Notification.permission === "default") {
      void requestNotificationPermission();
    }

    const interval = window.setInterval(() => {
      void loadScene(activeMatchId || undefined);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [activeMatchId, player]);

  useEffect(() => {
    if (typeof window === "undefined" || !player || Notification.permission !== "granted") return;

    let reminderTimer: number | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        reminderTimer = window.setTimeout(() => {
          void showSystemNotification({
            title: "Your matches are waiting",
            body: matches.length ? "You have chats and matches waiting in the partner finder." : "Finish your profile and keep swiping when you come back.",
            url: "/game/partner",
            tag: `dating-reminder-${player.id}`,
          });
        }, 60000);
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
  }, [matches.length, player]);

  const currentProfile = useMemo(() => {
    const available = profiles.filter((profile) => !passedIds.includes(profile.user_id));
    return available[stackIndex] ?? null;
  }, [passedIds, profiles, stackIndex]);

  const canUseDating = useMemo(() => {
    if (!player) return false;
    return (player.age ?? 18) >= 18 && (player.money ?? 0) >= 370 && (player.happiness ?? 0) >= 45 && !progress.spouse;
  }, [player, progress.spouse]);

  const activeMatch = matches.find((match) => match.id === activeMatchId) || null;
  const activeMatchProfile = activeMatch ? profileMap[activeMatch.user_a === player?.id ? activeMatch.user_b : activeMatch.user_a] : null;
  const activeMessages = activeMatch ? messages.filter((message) => message.match_id === activeMatch.id) : [];
  const exploreProfiles = profiles.slice(0, 8);

  const goalCards = useMemo(() => {
    const counts = profiles.reduce<Record<string, number>>((accumulator, profile) => {
      const key = profile.relationship_goal || "Still figuring it out";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(counts).map(([goal, count], index) => ({
      goal,
      count,
      palette: goalPalette[index % goalPalette.length],
    }));
  }, [profiles]);

  useEffect(() => {
    if (typeof window === "undefined" || !player || Notification.permission !== "granted") return;

    const summary = {
      likedMeCount: likedMeIds.length,
      matchCount: matches.length,
      messageCount: messages.length,
      lastMessageMatchId: messages[messages.length - 1]?.match_id || "",
    };

    const stored = window.localStorage.getItem(summaryKey(player.id));
    if (!stored) {
      window.localStorage.setItem(summaryKey(player.id), JSON.stringify(summary));
      return;
    }

    try {
      const previous = JSON.parse(stored) as typeof summary;

      if (document.visibilityState === "hidden") {
        if (summary.likedMeCount > previous.likedMeCount) {
          void showSystemNotification({
            title: "New like waiting",
            body: "Someone new liked your profile. Open the app to see who it is.",
            url: "/game/partner?tab=likes",
            tag: `dating-like-${player.id}`,
          });
        }

        if (summary.matchCount > previous.matchCount) {
          const newestMatch = matches[0];
          const newestProfile = newestMatch ? profileMap[newestMatch.user_a === player.id ? newestMatch.user_b : newestMatch.user_a] : null;
          void showSystemNotification({
            title: "It's a new match",
            body: newestProfile ? `${newestProfile.display_name} matched with you. Start chatting now.` : "You have a new mutual match waiting.",
            url: "/game/partner?tab=chat",
            tag: `dating-match-${player.id}`,
          });
        }

        if (summary.messageCount > previous.messageCount) {
          const latestMessage = messages[messages.length - 1];
          const latestMatch = latestMessage ? matches.find((match) => match.id === latestMessage.match_id) : null;
          const latestProfile = latestMatch ? profileMap[latestMatch.user_a === player.id ? latestMatch.user_b : latestMatch.user_a] : null;
          if (latestMessage?.sender_id !== player.id) {
            void showSystemNotification({
              title: latestProfile ? `${latestProfile.display_name} sent a message` : "New message",
              body: latestMessage?.body || "Open the inbox to reply.",
              url: "/game/partner?tab=chat",
              tag: `dating-message-${player.id}`,
            });
          }
        }
      }
    } catch {
      // Ignore bad local notification state and reset below.
    }

    window.localStorage.setItem(summaryKey(player.id), JSON.stringify(summary));
  }, [likedMeIds.length, matches, messages, player, profileMap]);

  const advanceStack = () => setStackIndex((value) => value + 1);

  const passProfile = () => {
    if (!currentProfile) return;
    setPassedIds((current) => [...current, currentProfile.user_id]);
    setStatus(`You passed on ${currentProfile.display_name}. Keep looking for the right person.`);
    advanceStack();
  };

  const likeProfile = async (superLike = false) => {
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

      setLikedIds((current) => [...current, currentProfile.user_id]);

      if (mutualLike) {
        const [userA, userB] = sortPair(player.id, currentProfile.user_id);
        const { error: matchInsertError } = await supabase
          .from("dating_matches")
          .upsert({ user_a: userA, user_b: userB }, { onConflict: "user_a,user_b" });

        if (matchInsertError) {
          setError(schemaHelp);
          setSaving(false);
          return;
        }

        setStatus(`It is a match with ${currentProfile.display_name}. You can start chatting now.`);
        setActiveTab("chat");
        await loadScene();
      } else {
        setStatus(superLike ? `You gave ${currentProfile.display_name} a strong like.` : `You liked ${currentProfile.display_name}.`);
        advanceStack();
      }
    } catch (likeError) {
      console.error("Dating like failed", likeError);
      setError("Could not save your like right now.");
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    if (!player || !activeMatch || !chatDraft.trim()) return;
    setSaving(true);
    setError("");

    try {
      const { error: sendError } = await supabase.from("dating_messages").insert({
        match_id: activeMatch.id,
        sender_id: player.id,
        body: chatDraft.trim(),
      });

      if (sendError) {
        setError(schemaHelp);
        setSaving(false);
        return;
      }

      setChatDraft("");
      setStatus(`Message sent to ${activeMatchProfile?.display_name || "your match"}.`);
      await loadScene(activeMatch.id);
    } catch (sendError) {
      console.error("Dating message failed", sendError);
      setError("Could not send the message right now.");
    } finally {
      setSaving(false);
    }
  };

  const makeItOfficial = async () => {
    if (!player || !activeMatchProfile || saving) return;
    setSaving(true);
    setError("");

    const nextProgress = { ...progress, spouse: activeMatchProfile.display_name };
    const newAge = (player.age ?? 18) + 1;
    const newMoney = Math.max(0, (player.money ?? 370) - 500);
    const newHealth = clamp((player.health ?? 100) - 2, 0, 100);
    const newHappiness = clamp((player.happiness ?? 100) + 18, 0, 100);

    try {
      window.localStorage.setItem(`life-progress:${player.id}`, JSON.stringify(nextProgress));
      window.sessionStorage.setItem(
        `life-game-flash:${player.id}`,
        `Age ${newAge}: you marry ${activeMatchProfile.display_name} after matching in the partner finder and begin a new chapter together.`
      );

      const { error: updateError } = await supabase
        .from("players")
        .update({ age: newAge, money: newMoney, health: newHealth, happiness: newHappiness, updated_at: new Date().toISOString() })
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
    return (
      <main className="min-h-screen bg-[#0c0b10] px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-rose-300/20 bg-black/50 p-8">
          <p className="text-sm uppercase tracking-[0.35em] text-rose-200">Partner Finder Error</p>
          <h1 className="mt-4 text-4xl font-black">Could not open the partner scene</h1>
          <p className="mt-4 text-lg text-stone-300">{error}</p>
          <button onClick={() => { window.location.href = "/game"; }} className="mt-8 rounded-2xl bg-white px-5 py-3 font-semibold text-black">Back to Game</button>
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
          <p className="mt-4 text-lg leading-8 text-stone-300">To use this feature, your character must be at least 18 years old, have R370+, happiness above 45, and not already be married.</p>
          <button onClick={() => { window.location.href = "/game"; }} className="mt-8 rounded-2xl bg-white px-5 py-3 font-semibold text-black">Back to Game</button>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen px-4 pb-32 pt-24 transition-colors ${
        isLightMode
          ? "bg-[linear-gradient(180deg,#f8fbff_0%,#edf4ff_34%,#ffffff_100%)] text-slate-950"
          : "bg-[linear-gradient(180deg,#17181d_0%,#111318_28%,#090a0f_100%)] text-white"
      }`}
    >
      <button
        type="button"
        onClick={() => { window.location.href = "/game"; }}
        className={`fixed left-4 top-4 z-[80] rounded-full px-5 py-3 text-sm font-semibold shadow-xl backdrop-blur transition ${
          isLightMode
            ? "border border-slate-200 bg-white/90 text-slate-950 hover:bg-white"
            : "border border-white/15 bg-black/75 text-white hover:bg-black/85"
        }`}
      >
        Back
      </button>
      <button
        type="button"
        onClick={() => setIsLightMode((current) => !current)}
        className={`fixed right-4 top-4 z-[80] rounded-full px-5 py-3 text-sm font-semibold shadow-xl backdrop-blur transition ${
          isLightMode ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-white text-slate-950 hover:bg-stone-100"
        }`}
      >
        {isLightMode ? "Dark" : "Light"}
      </button>

      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

        {activeTab === "swipe" ? (
          <section className="rounded-[2rem] border border-white/10 bg-black/35 p-4 shadow-xl backdrop-blur">
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">Encounters</p>
            <h2 className="mt-2 text-3xl font-bold">Swipe</h2>
            {currentProfile ? <SwipeCard profile={currentProfile} saving={saving} onPass={passProfile} onLike={() => void likeProfile()} onSuperLike={() => void likeProfile(true)} /> : <EmptySwipeState />}
          </section>
        ) : null}

        {activeTab === "explore" ? (
          <section className="rounded-[2rem] border border-white/10 bg-black/35 p-4 shadow-xl backdrop-blur">
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">Explore</p>
            <h2 className="mt-2 text-3xl font-bold">Relationship goals</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">{goalCards.length ? goalCards.map((card, index) => <GoalCard key={card.goal} goal={card.goal} count={card.count} palette={card.palette} featured={index === 0} />) : <DefaultExploreEmpty />}</div>
            <div className="mt-6 space-y-3">{exploreProfiles.map((profile) => <ExploreRow key={profile.user_id} profile={profile} />)}</div>
          </section>
        ) : null}

        {activeTab === "likes" ? (
          <section className="rounded-[2rem] border border-white/10 bg-black/35 p-4 shadow-xl backdrop-blur">
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">Likes</p>
            <h2 className="mt-2 text-3xl font-bold">Your activity</h2>
            <div className="mt-5 grid gap-3">
              <StatBox label="Matches" value={matches.length} />
              <StatBox label="People who liked you" value={likedMeIds.length} />
              <StatBox label="People you liked" value={likedIds.length} />
            </div>
            <div className="mt-6 space-y-3">{matches.map((match) => <MatchRowButton key={match.id} match={match} playerId={player?.id || ""} profile={profileMap[match.user_a === player?.id ? match.user_b : match.user_a]} onOpen={() => { setActiveMatchId(match.id); setActiveTab("chat"); }} />)}</div>
          </section>
        ) : null}

        {activeTab === "chat" ? (
          <section className="rounded-[2rem] border border-white/10 bg-black/35 p-4 shadow-xl backdrop-blur">
            <p className="text-sm uppercase tracking-[0.3em] text-white/50">Inbox</p>
            <h2 className="mt-2 text-3xl font-bold">Chats</h2>
            <div className="mt-5 flex gap-3 overflow-x-auto pb-1">{matches.map((match) => <ChatChip key={match.id} match={match} playerId={player?.id || ""} profile={profileMap[match.user_a === player?.id ? match.user_b : match.user_a]} active={activeMatchId === match.id} onOpen={() => setActiveMatchId(match.id)} />)}</div>
            {activeMatch && activeMatchProfile ? <ChatPanel activeMatchProfile={activeMatchProfile} activeMessages={activeMessages} activePlayerId={player?.id || ""} chatDraft={chatDraft} setChatDraft={setChatDraft} saving={saving} onSend={() => void sendMessage()} onCommit={() => void makeItOfficial()} /> : <div className="mt-5 rounded-[1.8rem] border border-white/10 bg-white/5 p-5 text-sm text-white/70">Your mutual matches will appear here. Once you both like each other, you can chat in this inbox.</div>}
          </section>
        ) : null}

        {activeTab === "profile" ? (
          <section className="rounded-[2rem] border border-white/10 bg-black/35 p-4 shadow-xl backdrop-blur">
            <div className="rounded-[1.7rem] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <GameLogo className="h-12 w-12" />
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-white/50">Partner Finder</p>
                  <h1 className="text-4xl font-black tracking-tight">Real Matches</h1>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-white/80">
                <span className="rounded-full bg-white/10 px-3 py-2">Age {player?.age ?? 18}</span>
                <span className="rounded-full bg-white/10 px-3 py-2">{moneyLabel} R{playerMoney}</span>
                <span className="rounded-full bg-white/10 px-3 py-2">Happiness {player?.happiness ?? 0}</span>
                <span className="rounded-full bg-white/10 px-3 py-2">{matches.length} Match{matches.length === 1 ? "" : "es"}</span>
              </div>
              <p className="mt-4 text-sm leading-7 text-white/70">{status}</p>
            </div>
            <p className="mt-5 text-sm uppercase tracking-[0.3em] text-white/50">Profile</p>
            <h2 className="mt-2 text-3xl font-bold">Your dating profile</h2>
            <OwnProfileCard profile={profileMap[player?.id || ""]} fallbackName={player?.name || "Player"} fallbackAge={player?.age || 18} fallbackCountry={player?.country || "Unknown"} />
            <button onClick={() => { window.location.href = "/game/partner/setup"; }} className="mt-5 w-full rounded-full bg-white px-5 py-4 font-semibold text-stone-950">Edit Profile</button>
          </section>
        ) : null}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-[70] mx-auto flex max-w-md items-center justify-between rounded-t-[2rem] border border-white/10 bg-[#111318]/95 px-4 py-3 text-xs text-white/65 backdrop-blur">
        {[
          { id: "swipe", label: "Swipe", icon: "◉" },
          { id: "explore", label: "Explore", icon: "◎" },
          { id: "likes", label: "Likes", icon: "♥" },
          { id: "chat", label: "Chat", icon: "◌" },
          { id: "profile", label: "Profile", icon: "◍" },
        ].map((item) => (
          <button key={item.id} onClick={() => setActiveTab(item.id as AppTab)} className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2 ${activeTab === item.id ? "bg-pink-500/20 text-white" : ""}`}>
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

function SwipeCard({
  profile,
  saving,
  onPass,
  onLike,
  onSuperLike,
}: {
  profile: DatingProfile;
  saving: boolean;
  onPass: () => void;
  onLike: () => void;
  onSuperLike: () => void;
}) {
  return (
    <div className="mt-5 rounded-[2rem] border border-white/10 bg-[#181a21] p-3 shadow-2xl">
      <div className="overflow-hidden rounded-[1.7rem] bg-black">
        <div className="aspect-[3/4] bg-black/40">{profile.photo_url ? <img src={profile.photo_url} alt={profile.display_name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-center text-white/55"><div><p className="text-sm uppercase tracking-[0.3em]">No Photo</p><p className="mt-3 text-lg">This user still needs to upload a dating photo.</p></div></div>}</div>
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-3xl font-black">{profile.display_name}, {profile.age}</h3>
            {isProfileVerified(profile) ? <span className="rounded-full bg-sky-400 px-2 py-1 text-xs font-bold text-slate-950">Verified</span> : null}
          </div>
          <p className="mt-2 text-sm text-white/70">{profile.location_label || profile.city}</p>
        </div>
        <button className="rounded-full bg-white/10 px-3 py-2 text-xl">⋯</button>
      </div>
      <p className="mt-4 text-sm leading-7 text-white/80">{profile.bio}</p>
      <div className="mt-4 flex flex-wrap gap-2">{(profile.interests || []).map((interest) => <span key={interest} className="rounded-full bg-white/10 px-3 py-2 text-xs text-white/75">{interest}</span>)}</div>
      <div className="mt-6 flex items-center justify-center gap-4">
        <button onClick={onPass} className="h-16 w-16 rounded-full bg-white text-4xl font-black text-stone-950 shadow-xl">×</button>
        <button onClick={onSuperLike} disabled={saving} className="h-16 w-16 rounded-full bg-white text-2xl text-stone-950 shadow-xl disabled:opacity-60">★</button>
        <button onClick={onLike} disabled={saving} className="h-16 w-16 rounded-full bg-white text-3xl text-stone-950 shadow-xl disabled:opacity-60">♥</button>
      </div>
    </div>
  );
}

function EmptySwipeState() {
  return <div className="mt-5 rounded-[2rem] border border-white/10 bg-white/5 p-6"><p className="text-sm uppercase tracking-[0.3em] text-white/50">No More Profiles</p><h3 className="mt-3 text-2xl font-bold">The deck is empty right now</h3><p className="mt-3 text-sm leading-7 text-white/75">As more real players create verified profiles, they will appear here under Swipe.</p></div>;
}

function GoalCard({ goal, count, palette, featured }: { goal: string; count: number; palette: string; featured: boolean }) {
  return (
    <div className={`rounded-[1.8rem] bg-gradient-to-br ${palette} p-4 ${featured ? "col-span-2 min-h-44" : "min-h-36"}`}>
      <div className="flex justify-end"><span className="rounded-full bg-black/35 px-2 py-1 text-xs font-semibold">{count}</span></div>
      <div className={featured ? "mt-12" : "mt-10"}>
        <h3 className={`${featured ? "text-3xl" : "text-2xl"} font-black`}>{goal}</h3>
        {featured ? <p className="mt-2 text-sm text-white/85">Find people with similar relationship goals.</p> : null}
      </div>
    </div>
  );
}

function DefaultExploreEmpty() {
  return (
    <>
      <div className="col-span-2 min-h-44 rounded-[1.8rem] bg-gradient-to-br from-rose-500/80 to-orange-400/80 p-4"><h3 className="mt-16 text-3xl font-black">Serious Daters</h3><p className="mt-2 text-sm text-white/85">As soon as players complete real profiles, categories will fill up here.</p></div>
      <div className="min-h-36 rounded-[1.8rem] bg-gradient-to-br from-fuchsia-700/80 to-purple-500/80 p-4"><h3 className="mt-10 text-2xl font-black">Long-term</h3></div>
      <div className="min-h-36 rounded-[1.8rem] bg-gradient-to-br from-amber-400/80 to-yellow-500/80 p-4"><h3 className="mt-10 text-2xl font-black">Short-term</h3></div>
    </>
  );
}

function ExploreRow({ profile }: { profile: DatingProfile }) {
  return <div className="flex gap-3 rounded-[1.7rem] border border-white/10 bg-white/5 p-3"><div className="h-24 w-20 overflow-hidden rounded-2xl bg-white/10">{profile.photo_url ? <img src={profile.photo_url} alt={profile.display_name} className="h-full w-full object-cover" /> : null}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate text-xl font-bold">{profile.display_name}, {profile.age}</h3>{isProfileVerified(profile) ? <span className="rounded-full bg-sky-400 px-2 py-1 text-[10px] font-bold text-slate-950">Verified</span> : null}</div><p className="mt-1 text-sm text-white/65">{profile.location_label || profile.city}</p><p className="mt-2 line-clamp-2 text-sm text-white/75">{profile.relationship_goal || "Still figuring it out"}</p></div></div>;
}

function StatBox({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[1.7rem] border border-white/10 bg-white/5 p-4"><p className="text-sm uppercase tracking-[0.25em] text-white/50">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>;
}

function MatchRowButton({ profile, onOpen }: { match: MatchRow; playerId: string; profile?: DatingProfile; onOpen: () => void }) {
  if (!profile) return null;
  return <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-[1.7rem] border border-white/10 bg-white/5 p-3 text-left"><div className="h-20 w-16 overflow-hidden rounded-2xl bg-white/10">{profile.photo_url ? <img src={profile.photo_url} alt={profile.display_name} className="h-full w-full object-cover" /> : null}</div><div className="flex-1"><div className="flex items-center gap-2"><h3 className="text-lg font-bold">{profile.display_name}</h3>{isProfileVerified(profile) ? <span className="rounded-full bg-sky-400 px-2 py-1 text-[10px] font-bold text-slate-950">Verified</span> : null}</div><p className="mt-1 text-sm text-white/65">{profile.relationship_goal || "Still figuring it out"}</p></div></button>;
}

function ChatChip({ profile, active, onOpen }: { match: MatchRow; playerId: string; profile?: DatingProfile; active: boolean; onOpen: () => void }) {
  if (!profile) return null;
  return <button onClick={onOpen} className={`min-w-28 rounded-[1.5rem] border px-3 py-3 text-left ${active ? "border-pink-400 bg-pink-500/15" : "border-white/10 bg-white/5"}`}><p className="truncate text-sm font-semibold">{profile.display_name}</p><p className="mt-1 truncate text-xs text-white/60">{profile.location_label || profile.city}</p></button>;
}

function ChatPanel({ activeMatchProfile, activeMessages, activePlayerId, chatDraft, setChatDraft, saving, onSend, onCommit }: { activeMatchProfile: DatingProfile; activeMessages: MessageRow[]; activePlayerId: string; chatDraft: string; setChatDraft: (value: string) => void; saving: boolean; onSend: () => void; onCommit: () => void; }) {
  return (
    <>
      <div className="mt-5 rounded-[1.8rem] border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-3"><div className="h-16 w-14 overflow-hidden rounded-2xl bg-white/10">{activeMatchProfile.photo_url ? <img src={activeMatchProfile.photo_url} alt={activeMatchProfile.display_name} className="h-full w-full object-cover" /> : null}</div><div><div className="flex items-center gap-2"><h3 className="text-xl font-bold">{activeMatchProfile.display_name}, {activeMatchProfile.age}</h3>{isProfileVerified(activeMatchProfile) ? <span className="rounded-full bg-sky-400 px-2 py-1 text-[10px] font-bold text-slate-950">Verified</span> : null}</div><p className="mt-1 text-sm text-white/65">{activeMatchProfile.location_label || activeMatchProfile.city}</p></div></div></div>
      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-[1.8rem] border border-white/10 bg-[#14161d] p-4">{activeMessages.length ? activeMessages.map((message) => <div key={message.id} className={`flex ${message.sender_id === activePlayerId ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-[1.5rem] px-4 py-3 text-sm leading-6 ${message.sender_id === activePlayerId ? "bg-pink-500 text-white" : "bg-white/10 text-white/85"}`}>{message.body}</div></div>) : <p className="text-sm text-white/55">No messages yet. Start the conversation.</p>}</div>
      <div className="mt-4 flex gap-3"><input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="Send a message" className="flex-1 rounded-full bg-white px-4 py-3 text-black outline-none" /><button onClick={onSend} disabled={saving} className="rounded-full bg-white px-5 py-3 font-semibold text-stone-950 disabled:opacity-60">Send</button></div>
      <button onClick={onCommit} disabled={saving} className="mt-4 w-full rounded-full bg-pink-500 px-5 py-4 font-semibold text-white transition hover:bg-pink-400 disabled:opacity-60">Make It Official</button>
    </>
  );
}

function OwnProfileCard({ profile, fallbackName, fallbackAge, fallbackCountry }: { profile?: DatingProfile; fallbackName: string; fallbackAge: number; fallbackCountry: string; }) {
  return <div className="mt-5 rounded-[1.8rem] border border-white/10 bg-white/5 p-4"><div className="flex gap-4"><div className="h-28 w-24 overflow-hidden rounded-[1.5rem] bg-white/10">{profile?.photo_url ? <img src={profile.photo_url} alt="Your dating profile" className="h-full w-full object-cover" /> : null}</div><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-black">{profile?.display_name || fallbackName}, {profile?.age || fallbackAge}</h3>{isProfileVerified(profile) ? <span className="rounded-full bg-sky-400 px-2 py-1 text-[10px] font-bold text-slate-950">Verified</span> : null}</div><p className="mt-2 text-sm text-white/65">{profile?.location_label || profile?.city || fallbackCountry}</p><p className="mt-3 text-sm text-white/80">{profile?.relationship_goal || "Still figuring it out"}</p></div></div><p className="mt-4 text-sm leading-7 text-white/80">{profile?.bio || "Finish your profile setup to appear in Swipe and Explore."}</p><div className="mt-4 flex flex-wrap gap-2">{(profile?.interests || []).map((interest) => <span key={interest} className="rounded-full bg-white/10 px-3 py-2 text-xs text-white/75">{interest}</span>)}</div></div>;
}
