"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  is_online?: boolean | null;
  updated_at?: string | null;
};

type PlayerPresence = {
  is_online: boolean;
  last_seen_at: string | null;
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
  contact_verified: boolean;
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
const chatImagePrefix = "[chat-image]";
const chatEmojis = ["😀", "😂", "😍", "😘", "🥰", "😎", "😢", "😡", "🔥", "❤️", "👍", "🙏", "🎉", "💯", "👀", "✨"];
const isProfileVerified = (profile?: Pick<DatingProfile, "contact_verified" | "profile_verified" | "is_photo_verified" | "selfie_url">) =>
  Boolean(profile?.contact_verified || profile?.profile_verified || (profile?.is_photo_verified && profile.selfie_url));
const isChatImageMessage = (body: string) => body.startsWith(chatImagePrefix);
const chatImageUrl = (body: string) => body.replace(chatImagePrefix, "");
const formatLastSeen = (value?: string | null) => {
  if (!value) return "Last seen recently";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Last seen recently";

  return `Last seen ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const formatChatDivider = (value?: string | null) => {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return safeDate.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatMessageStamp = (message: MessageRow) => {
  const date = new Date(message.read_at || message.created_at);
  if (Number.isNaN(date.getTime())) return message.read_at ? "Seen" : "Sent";

  return `${message.read_at ? "Seen" : "Sent"} ${date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
};

export default function PartnerScenePage() {
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [progress, setProgress] = useState<Progress>(baseProgress);
  const [profiles, setProfiles] = useState<DatingProfile[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, DatingProfile>>({});
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, PlayerPresence>>({});
  const [typingByMatch, setTypingByMatch] = useState<Record<string, boolean>>({});
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
  const [matchCelebrationProfile, setMatchCelebrationProfile] = useState<DatingProfile | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef("");
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
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
        .select("id, name, age, money, health, happiness, education, country, is_online, updated_at")
        .eq("id", user.id)
        .single();

      if (playerError || !playerData) {
        setError(playerError?.message || "Could not open the partner finder.");
        setLoading(false);
        return;
      }

      void supabase
        .from("players")
        .update({ is_online: true, updated_at: new Date().toISOString() })
        .eq("id", user.id);

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
      const presenceIds = Array.from(new Set([...Object.keys(nextMap), user.id]));
      let nextPresenceMap: Record<string, PlayerPresence> = {};

      if (presenceIds.length) {
        const { data: presenceRows } = await supabase
          .from("players")
          .select("id, is_online, updated_at")
          .in("id", presenceIds);

        nextPresenceMap = ((presenceRows || []) as Array<{ id: string; is_online: boolean | null; updated_at: string | null }>).reduce<Record<string, PlayerPresence>>(
          (accumulator, row) => {
            accumulator[row.id] = { is_online: Boolean(row.is_online), last_seen_at: row.updated_at };
            return accumulator;
          },
          {}
        );
      }

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
      setPresenceMap(nextPresenceMap);
      setMatches(typedMatches);
      setMessages(messageRows);
      setLikedIds(nextLikedIds);
      setLikedMeIds((likesReceived || []).map((row) => row.liker_id));
      setActiveMatchId((current) => preserveMatchId || current);
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
    if (!player) return;

    const markOnline = () => {
      setPresenceMap((current) => ({ ...current, [player.id]: { is_online: true, last_seen_at: new Date().toISOString() } }));
      void supabase.from("players").update({ is_online: true, updated_at: new Date().toISOString() }).eq("id", player.id);
    };
    const markOffline = () => {
      setPresenceMap((current) => ({ ...current, [player.id]: { is_online: false, last_seen_at: new Date().toISOString() } }));
      void supabase.from("players").update({ is_online: false, updated_at: new Date().toISOString() }).eq("id", player.id);
    };
    const syncVisibility = () => {
      if (document.visibilityState === "visible") markOnline();
    };

    markOnline();
    const heartbeat = window.setInterval(markOnline, 15000);
    window.addEventListener("focus", markOnline);
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("pagehide", markOffline);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("focus", markOnline);
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("pagehide", markOffline);
    };
  }, [player]);

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
    if (!player) return;

    const matchIds = matches.map((match) => match.id);
    const presenceIds = Array.from(new Set([player.id, ...matches.map((match) => (match.user_a === player.id ? match.user_b : match.user_a))]));

    const mergeMessage = (row: MessageRow) => {
      setMessages((current) => {
        const next = current.some((message) => message.id === row.id)
          ? current.map((message) => (message.id === row.id ? { ...message, ...row } : message))
          : [...current, row];

        return next.sort((first, second) => new Date(first.created_at).getTime() - new Date(second.created_at).getTime());
      });
    };

    const refreshChatState = async () => {
      if (presenceIds.length) {
        const { data: presenceRows } = await supabase.from("players").select("id, is_online, updated_at").in("id", presenceIds);
        setPresenceMap((current) => ({
          ...current,
          ...((presenceRows || []) as Array<{ id: string; is_online: boolean | null; updated_at: string | null }>).reduce<Record<string, PlayerPresence>>(
            (accumulator, row) => {
              accumulator[row.id] = { is_online: Boolean(row.is_online), last_seen_at: row.updated_at };
              return accumulator;
            },
            {}
          ),
        }));
      }

      if (matchIds.length) {
        const { data: fetchedMessages } = await supabase
          .from("dating_messages")
          .select("id, match_id, sender_id, body, created_at, read_at")
          .in("match_id", matchIds)
          .order("created_at", { ascending: true });

        if (fetchedMessages) setMessages(fetchedMessages as MessageRow[]);
      }
    };

    const channel = supabase
      .channel(`dating-live-${player.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dating_messages" }, (payload) => {
        const row = payload.new as MessageRow | null;
        if (!row?.match_id || !matchIds.includes(row.match_id)) return;
        mergeMessage(row);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "players" }, (payload) => {
        const row = payload.new as { id?: string; is_online?: boolean | null; updated_at?: string | null };
        if (!row.id || !presenceIds.includes(row.id)) return;
        setPresenceMap((current) => ({ ...current, [row.id as string]: { is_online: Boolean(row.is_online), last_seen_at: row.updated_at || null } }));
      })
      .subscribe();

    const interval = window.setInterval(refreshChatState, activeTab === "chat" ? 5000 : 12000);
    void refreshChatState();

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [activeTab, matches, player]);

  useEffect(() => {
    if (!player) return;

    const presenceIds = Array.from(new Set([player.id, ...matches.map((match) => (match.user_a === player.id ? match.user_b : match.user_a))]));
    const channel = supabase.channel("dating-online-presence", { config: { presence: { key: player.id } } });
    const syncPresenceState = () => {
      const state = channel.presenceState() as Record<string, Array<{ user_id?: string; online_at?: string }>>;
      const onlineIds = new Set(
        Object.values(state)
          .flat()
          .map((entry) => entry.user_id)
          .filter(Boolean) as string[]
      );

      setPresenceMap((current) => {
        const next = { ...current };
        presenceIds.forEach((id) => {
          next[id] = {
            is_online: onlineIds.has(id),
            last_seen_at: onlineIds.has(id) ? new Date().toISOString() : next[id]?.last_seen_at || null,
          };
        });
        return next;
      });
    };

    channel
      .on("presence", { event: "sync" }, syncPresenceState)
      .on("presence", { event: "join" }, syncPresenceState)
      .on("presence", { event: "leave" }, syncPresenceState)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ user_id: player.id, online_at: new Date().toISOString() });
        }
      });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [matches, player]);

  useEffect(() => {
    if (!player || activeTab !== "chat" || !activeMatchId) return;

    const unreadMessageIds = messages
      .filter((message) => message.match_id === activeMatchId && message.sender_id !== player.id && !message.read_at)
      .map((message) => message.id);

    if (!unreadMessageIds.length) return;

    const readAt = new Date().toISOString();
    setMessages((current) =>
      current.map((message) => (unreadMessageIds.includes(message.id) ? { ...message, read_at: readAt } : message))
    );

    void supabase
      .from("dating_messages")
      .update({ read_at: readAt })
      .eq("match_id", activeMatchId)
      .neq("sender_id", player.id)
      .is("read_at", null);
  }, [activeMatchId, activeTab, messages, player]);

  useEffect(() => {
    if (!player || !activeMatchId) return;

    const channel = supabase
      .channel(`dating-typing-${activeMatchId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const typingPayload = payload as { match_id?: string; sender_id?: string; is_typing?: boolean };
        if (typingPayload.match_id !== activeMatchId || typingPayload.sender_id === player.id) return;

        setTypingByMatch((current) => ({ ...current, [activeMatchId]: Boolean(typingPayload.is_typing) }));
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [activeMatchId, player]);

  useEffect(() => {
    if (!player || activeTab !== "chat" || !activeMatchId || !typingChannelRef.current) return;

    const isTyping = Boolean(chatDraft.trim());
    const typingKey = `${activeMatchId}:${isTyping}`;
    if (lastTypingSentRef.current === typingKey) return;

    lastTypingSentRef.current = typingKey;
    void typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { match_id: activeMatchId, sender_id: player.id, is_typing: isTyping },
    });

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    if (isTyping) {
      typingTimeoutRef.current = window.setTimeout(() => {
        lastTypingSentRef.current = `${activeMatchId}:false`;
        void typingChannelRef.current?.send({
          type: "broadcast",
          event: "typing",
          payload: { match_id: activeMatchId, sender_id: player.id, is_typing: false },
        });
      }, 2200);
    }
  }, [activeMatchId, activeTab, chatDraft, player]);

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
  const unreadCounts = useMemo(() => {
    if (!player) return {};

    return messages.reduce<Record<string, number>>((accumulator, message) => {
      if (message.sender_id !== player.id && !message.read_at) {
        accumulator[message.match_id] = (accumulator[message.match_id] || 0) + 1;
      }

      return accumulator;
    }, {});
  }, [messages, player]);
  const totalUnreadCount = Object.values(unreadCounts).reduce((total, count) => total + count, 0);
  const exploreProfiles = profiles.slice(0, 8);

  const markMatchAsRead = (matchId: string) => {
    if (!player) return;

    const hasUnread = messages.some((message) => message.match_id === matchId && message.sender_id !== player.id && !message.read_at);
    if (!hasUnread) return;

    const readAt = new Date().toISOString();
    setMessages((current) =>
      current.map((message) =>
        message.match_id === matchId && message.sender_id !== player.id && !message.read_at ? { ...message, read_at: readAt } : message
      )
    );

    void supabase
      .from("dating_messages")
      .update({ read_at: readAt })
      .eq("match_id", matchId)
      .neq("sender_id", player.id)
      .is("read_at", null);
  };

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
        const { data: matchRow, error: matchInsertError } = await supabase
          .from("dating_matches")
          .upsert({ user_a: userA, user_b: userB }, { onConflict: "user_a,user_b" })
          .select("id, user_a, user_b, created_at")
          .single();

        if (matchInsertError) {
          setError(schemaHelp);
          setSaving(false);
          return;
        }

        setStatus(`It is a match with ${currentProfile.display_name}. You can start chatting now.`);
        setMatchCelebrationProfile(currentProfile);
        advanceStack();
        await loadScene(matchRow?.id);
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

  const sendMessage = async (quickBody?: string) => {
    const body = (quickBody || chatDraft).trim();
    if (!player || !activeMatch || !body) return;
    setSaving(true);
    setError("");
    const tempId = `temp-${Date.now()}`;
    const tempMessage: MessageRow = {
      id: tempId,
      match_id: activeMatch.id,
      sender_id: player.id,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    const shouldClearDraft = !quickBody;

    try {
      setMessages((current) => [...current, tempMessage]);
      if (shouldClearDraft) setChatDraft("");

      const { data: sentMessage, error: sendError } = await supabase
        .from("dating_messages")
        .insert({
          match_id: activeMatch.id,
          sender_id: player.id,
          body,
        })
        .select("id, match_id, sender_id, body, created_at, read_at")
        .single();

      if (sendError) {
        setMessages((current) => current.filter((message) => message.id !== tempId));
        if (shouldClearDraft) setChatDraft(body);
        setError(schemaHelp);
        setSaving(false);
        return;
      }

      if (sentMessage) {
        setMessages((current) => {
          const typedMessage = sentMessage as MessageRow;
          if (current.some((message) => message.id === typedMessage.id)) {
            return current.filter((message) => message.id !== tempId);
          }

          return current.map((message) => (message.id === tempId ? typedMessage : message));
        });
      }

      setStatus(`Message sent to ${activeMatchProfile?.display_name || "your match"}.`);
    } catch (sendError) {
      console.error("Dating message failed", sendError);
      setMessages((current) => current.filter((message) => message.id !== tempId));
      if (shouldClearDraft) setChatDraft(body);
      setError("Could not send the message right now.");
    } finally {
      setSaving(false);
    }
  };

  const sendChatImage = async (file: File) => {
    if (!player || !activeMatch || !file.type.startsWith("image/")) return;
    setSaving(true);
    setError("");

    try {
      const extension = file.name.split(".").pop() || "jpg";
      const filePath = `${player.id}/chat-${activeMatch.id}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("dating-photos").upload(filePath, file, { upsert: true });

      if (uploadError) {
        setError(`Could not upload picture: ${uploadError.message}`);
        setSaving(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("dating-photos").getPublicUrl(filePath);
      const { data: sentMessage, error: sendError } = await supabase
        .from("dating_messages")
        .insert({
          match_id: activeMatch.id,
          sender_id: player.id,
          body: `${chatImagePrefix}${publicUrlData.publicUrl}`,
        })
        .select("id, match_id, sender_id, body, created_at, read_at")
        .single();

      if (sendError) {
        setError(schemaHelp);
        setSaving(false);
        return;
      }

      if (sentMessage) {
        setMessages((current) => (current.some((message) => message.id === sentMessage.id) ? current : [...current, sentMessage as MessageRow]));
      }
      setStatus(`Picture sent to ${activeMatchProfile?.display_name || "your match"}.`);
    } catch (sendError) {
      console.error("Dating picture message failed", sendError);
      setError("Could not send the picture right now.");
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
      className={`min-h-screen px-4 pb-32 pt-24 transition-colors ${activeMatch ? "overflow-hidden" : ""} ${
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
            <div className="mt-6 space-y-3">{matches.map((match) => <MatchRowButton key={match.id} match={match} playerId={player?.id || ""} profile={profileMap[match.user_a === player?.id ? match.user_b : match.user_a]} onOpen={() => { markMatchAsRead(match.id); setActiveMatchId(match.id); setActiveTab("chat"); }} />)}</div>
          </section>
        ) : null}

        {activeTab === "chat" ? (
          <section className={activeMatch ? "fixed bottom-[5.7rem] left-1/2 top-[5.2rem] z-[60] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-[2rem] border border-white/10 bg-[#071323] text-white shadow-2xl" : "rounded-[2rem] border border-white/10 bg-black/35 p-4 shadow-xl backdrop-blur"}>
            {!activeMatch ? (
              <>
                <p className="text-sm uppercase tracking-[0.3em] text-white/50">Inbox</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <h2 className="text-3xl font-bold">Chats</h2>
                  {totalUnreadCount ? <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-black text-white">{totalUnreadCount} unread</span> : null}
                </div>
              </>
            ) : null}

            {activeMatch && activeMatchProfile ? (
                <ChatPanel
                activeMatchProfile={activeMatchProfile}
                activeMessages={activeMessages}
                activePlayerId={player?.id || ""}
                chatDraft={chatDraft}
                setChatDraft={setChatDraft}
                saving={saving}
                onSend={() => void sendMessage()}
                onQuickSend={(body) => void sendMessage(body)}
                onCommit={() => void makeItOfficial()}
                onBack={() => {
                  setActiveMatchId("");
                setChatDraft("");
                }}
                presence={presenceMap[activeMatchProfile.user_id]}
                isTyping={Boolean(typingByMatch[activeMatch.id])}
                onImageSend={(file) => void sendChatImage(file)}
                onStartCall={(kind) => {
                  setError(`${kind === "video" ? "Video call" : "Voice call"} is coming soon.`);
                }}
              />
            ) : matches.length ? (
              <div className="mt-5 space-y-3">
                {matches.map((match) => {
                  const profile = profileMap[match.user_a === player?.id ? match.user_b : match.user_a];
                  return (
                    <ChatListButton
                      key={match.id}
                      match={match}
                      profile={profile}
                      unreadCount={unreadCounts[match.id] || 0}
                      presence={profile ? presenceMap[profile.user_id] : undefined}
                      onOpen={() => {
                        markMatchAsRead(match.id);
                        setActiveMatchId(match.id);
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-[1.8rem] border border-white/10 bg-white/5 p-5 text-sm text-white/70">Your mutual matches will appear here. Once you both like each other, you can chat in this inbox.</div>
            )}
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
            <span className="relative text-base">
              {item.icon}
              {item.id === "chat" && totalUnreadCount ? (
                <span className="absolute -right-3 -top-2 min-w-5 rounded-full bg-rose-500 px-1 text-[10px] font-black leading-5 text-white">
                  {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
                </span>
              ) : null}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {matchCelebrationProfile ? (
        <MatchCelebration
          profile={matchCelebrationProfile}
          onKeepSwiping={() => setMatchCelebrationProfile(null)}
          onOpenChat={() => {
            setMatchCelebrationProfile(null);
            setActiveTab("chat");
          }}
        />
      ) : null}
    </main>
  );
}

function MatchCelebration({
  profile,
  onKeepSwiping,
  onOpenChat,
}: {
  profile: DatingProfile;
  onKeepSwiping: () => void;
  onOpenChat: () => void;
}) {
  const hearts = [
    "left-[8%] top-[12%] text-rose-300",
    "right-[10%] top-[14%] text-fuchsia-300",
    "left-[16%] top-[34%] text-sky-300",
    "right-[16%] top-[38%] text-amber-300",
    "left-[11%] bottom-[24%] text-pink-400",
    "right-[12%] bottom-[22%] text-lime-300",
  ];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/82 px-4 py-8 backdrop-blur">
      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/15 bg-[#15151d] p-5 text-center text-white shadow-[0_30px_90px_rgba(0,0,0,0.65)]">
        {hearts.map((position, index) => (
          <span key={position} className={`pointer-events-none absolute text-3xl font-black ${position}`} style={{ transform: `rotate(${index % 2 ? 14 : -12}deg)` }}>
            &hearts;
          </span>
        ))}

        <p className="text-sm uppercase tracking-[0.35em] text-pink-200">It is a match!!</p>
        <h2 className="mt-3 text-4xl font-black tracking-tight">You and {profile.display_name}</h2>

        <div className="mx-auto mt-6 h-44 w-44 overflow-hidden rounded-full border-4 border-pink-300 bg-white/10 shadow-[0_0_50px_rgba(236,72,153,0.42)]">
          {profile.photo_url ? (
            <img src={profile.photo_url} alt={profile.display_name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-white/60">No photo</div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          <h3 className="text-2xl font-black">{profile.display_name}, {profile.age}</h3>
          {isProfileVerified(profile) ? <span className="rounded-full bg-sky-400 px-2 py-1 text-xs font-bold text-slate-950">Verified</span> : null}
        </div>
        <p className="mt-2 text-sm text-white/68">{profile.location_label || profile.city}</p>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-white/76">{profile.relationship_goal || "Start with a hello and see where it goes."}</p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button onClick={onOpenChat} className="rounded-full bg-pink-500 px-5 py-4 font-bold text-white shadow-xl transition hover:bg-pink-400">
            Start Chat
          </button>
          <button onClick={onKeepSwiping} className="rounded-full border border-white/15 bg-white/10 px-5 py-4 font-bold text-white transition hover:bg-white/15">
            Keep Swiping
          </button>
        </div>
      </div>
    </div>
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

function ChatListButton({
  profile,
  unreadCount,
  presence,
  onOpen,
}: {
  match: MatchRow;
  profile?: DatingProfile;
  unreadCount: number;
  presence?: PlayerPresence;
  onOpen: () => void;
}) {
  if (!profile) return null;
  const isOnline = Boolean(presence?.is_online);
  const presenceLabel = isOnline ? "Online" : formatLastSeen(presence?.last_seen_at);

  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-[1.7rem] border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10">
      <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/10">
        {profile.photo_url ? <img src={profile.photo_url} alt={profile.display_name} className="h-full w-full object-cover" /> : null}
        <span className={`absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-[#181a21] ${isOnline ? "bg-emerald-400" : "bg-red-500"}`}></span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-xl font-black">{profile.display_name}, {profile.age}</h3>
          {isProfileVerified(profile) ? <span className="shrink-0 rounded-full bg-sky-400 px-2 py-1 text-[10px] font-bold text-slate-950">Verified</span> : null}
        </div>
        <p className="mt-1 text-sm text-white/65">{presenceLabel} - {profile.location_label || profile.city}</p>
      </div>
      {unreadCount ? (
        <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-rose-500 px-2 text-xs font-black text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}

function PhoneIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d="M6.6 10.8c1.6 3.1 3.5 5 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1.3.4 2.6.6 4 .6.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C10.5 21.9 2.1 13.5 2.1 3.4c0-.7.5-1.2 1.2-1.2h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.7.6 4 .1.4 0 .9-.3 1.2l-1.7 2.2z" /></svg>;
}

function VideoIcon({ className = "h-5 w-5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d="M4 6.5C4 5.1 5.1 4 6.5 4h7C14.9 4 16 5.1 16 6.5v1.7l3.5-2.1c.9-.5 2 .1 2 1.1v9.6c0 1-1.1 1.6-2 1.1L16 15.8v1.7c0 1.4-1.1 2.5-2.5 2.5h-7C5.1 20 4 18.9 4 17.5v-11z" /></svg>;
}

function MicIcon({ className = "h-6 w-6" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d="M12 14.5c1.7 0 3-1.3 3-3V5c0-1.7-1.3-3-3-3S9 3.3 9 5v6.5c0 1.7 1.3 3 3 3z" /><path d="M18.5 11.5c0 3.2-2.4 5.8-5.5 6.2V21h3v2H8v-2h3v-3.3c-3.1-.5-5.5-3.1-5.5-6.2h2c0 2.5 2 4.5 4.5 4.5s4.5-2 4.5-4.5h2z" /></svg>;
}

function PhotoIcon({ className = "h-6 w-6" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d="M5 4h14c1.7 0 3 1.3 3 3v10c0 1.7-1.3 3-3 3H5c-1.7 0-3-1.3-3-3V7c0-1.7 1.3-3 3-3zm3 6.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.5 6.2c.1.7.7 1.3 1.5 1.3h12c.7 0 1.3-.5 1.5-1.2l-4.1-4.4c-.5-.5-1.3-.5-1.8 0L11 15l-1.4-1.4c-.5-.5-1.3-.5-1.8.1l-3.3 3z" /></svg>;
}

function SmileIcon({ className = "h-6 w-6" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-3.2 8.1c-.7 0-1.2-.5-1.2-1.2s.5-1.2 1.2-1.2S10 8.2 10 8.9s-.5 1.2-1.2 1.2zm6.4 0c-.7 0-1.2-.5-1.2-1.2s.5-1.2 1.2-1.2 1.2.5 1.2 1.2-.5 1.2-1.2 1.2zM12 17.4c-2.3 0-4.2-1.3-5.1-3.2h2.2c.7.8 1.7 1.2 2.9 1.2s2.2-.4 2.9-1.2h2.2c-.9 1.9-2.8 3.2-5.1 3.2z" /></svg>;
}

function ThumbIcon({ className = "h-6 w-6" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true"><path d="M2 10.5C2 9.7 2.7 9 3.5 9H6v12H3.5C2.7 21 2 20.3 2 19.5v-9zM8 21V8.7l4.6-5.1c.8-.9 2.4-.4 2.4.9V9h4.7c1.5 0 2.6 1.4 2.2 2.8l-1.8 6.8c-.4 1.4-1.6 2.4-3.1 2.4H8z" /></svg>;
}

function ChatPanel({
  activeMatchProfile,
  activeMessages,
  activePlayerId,
  chatDraft,
  setChatDraft,
  saving,
  onSend,
  onQuickSend,
  onCommit,
  onBack,
  presence,
  isTyping,
  onImageSend,
  onStartCall,
}: {
  activeMatchProfile: DatingProfile;
  activeMessages: MessageRow[];
  activePlayerId: string;
  chatDraft: string;
  setChatDraft: (value: string) => void;
  saving: boolean;
  onSend: () => void;
  onQuickSend: (body: string) => void;
  onCommit: () => void;
  onBack: () => void;
  presence?: PlayerPresence;
  isTyping: boolean;
  onImageSend: (file: File) => void;
  onStartCall: (kind: "voice" | "video") => void;
}) {
  const isOnline = Boolean(presence?.is_online);
  const presenceLabel = isTyping ? "Typing..." : isOnline ? "Online" : formatLastSeen(presence?.last_seen_at);
  const dividerLabel = formatChatDivider(activeMessages[0]?.created_at);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#071323] text-white">
      <div className="shrink-0 flex items-center gap-3 border-b border-white/10 bg-[#0b1728] px-4 py-3 shadow-sm">
        <button onClick={onBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-black text-white transition hover:bg-white/15" aria-label="Back to chats">
          &lt;
        </button>

        <div className="relative h-12 w-12 shrink-0">
          <div className="h-full w-full overflow-hidden rounded-full bg-white/10">
            {activeMatchProfile.photo_url ? <img src={activeMatchProfile.photo_url} alt={activeMatchProfile.display_name} className="h-full w-full object-cover" /> : null}
          </div>
          <span className={`absolute bottom-0 right-0 z-10 h-4 w-4 rounded-full border-[3px] border-[#0b1728] ${isOnline ? "bg-emerald-500" : "bg-red-500"}`}></span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <h3 className="truncate text-xl font-bold leading-tight text-white">{activeMatchProfile.display_name}</h3>
            {isProfileVerified(activeMatchProfile) ? <span className="shrink-0 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-bold text-white">Verified</span> : null}
            <span className="text-sm font-black text-sky-300">v</span>
          </div>
          <p className="truncate text-sm font-medium text-white/55">{presenceLabel}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1 text-sky-300">
          <button onClick={() => onStartCall("voice")} className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10" aria-label="Start voice call">
            <PhoneIcon />
          </button>
          <button onClick={() => onStartCall("video")} className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/10" aria-label="Start video call">
            <VideoIcon />
          </button>
          <button className="hidden h-10 w-10 items-center justify-center rounded-full text-2xl font-black transition hover:bg-white/10 sm:flex" aria-label="Minimize chat">
            -
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain bg-[#071323] px-4 py-5">
        <p className="text-center text-sm font-bold text-white/45">{dividerLabel}</p>
        {activeMessages.length ? (
          activeMessages.map((message) => {
            const isOwnMessage = message.sender_id === activePlayerId;

            return (
              <div key={message.id} className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] ${isOwnMessage ? "items-end" : "items-start"} flex flex-col`}>
                  {isChatImageMessage(message.body) ? (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/10 shadow-sm">
                      <img src={chatImageUrl(message.body)} alt="Chat picture" className="max-h-80 w-full object-cover" />
                    </div>
                  ) : (
                    <div className={`break-words rounded-[1.35rem] px-4 py-3 text-sm leading-6 shadow-sm ${isOwnMessage ? "bg-blue-600 text-white" : "bg-[#152238] text-white/90"}`}>
                      {message.body}
                    </div>
                  )}
                  {isOwnMessage ? (
                    <p className="mt-1 text-right text-[12px] font-medium text-white/45">{formatMessageStamp(message)}</p>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-[1.5rem] bg-white/5 p-5 text-center text-sm leading-6 text-white/55">
            No messages yet. Start the conversation.
          </div>
        )}
        {isTyping ? <p className="text-sm font-semibold text-sky-300">{activeMatchProfile.display_name} is typing...</p> : null}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#0b1728] px-3 py-3">
        {showEmojiPicker ? (
          <div className="mb-3 grid grid-cols-8 gap-2 rounded-3xl border border-white/10 bg-[#101d31] p-3 shadow-xl">
            {chatEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setChatDraft(`${chatDraft}${emoji}`);
                  setShowEmojiPicker(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:bg-white/10"
                aria-label={`Add ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sky-300 transition hover:bg-white/10" aria-label="Record voice message">
            <MicIcon />
          </button>
          <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-sky-300 transition hover:bg-white/10" aria-label="Send picture">
            <PhotoIcon />
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={saving}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onImageSend(file);
              }}
            />
          </label>
          <button className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-sky-300 transition hover:bg-white/10 sm:flex" aria-label="Send sticker">
            <span className="rounded-md border-2 border-current px-1 text-xs font-black">S</span>
          </button>
          <button className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black text-sky-300 transition hover:bg-white/10 sm:flex" aria-label="Send GIF">
            GIF
          </button>
          <input
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) onSend();
            }}
            placeholder="Aa"
            className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/45"
          />
          <button onClick={() => setShowEmojiPicker((current) => !current)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sky-300 transition hover:bg-white/10" aria-label="Choose emoji">
            <SmileIcon />
          </button>
          <button onClick={chatDraft.trim() ? onSend : () => onQuickSend("\u{1F44D}")} disabled={saving} className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 px-3 text-sm font-black text-white transition hover:bg-blue-500 disabled:opacity-60" aria-label={chatDraft.trim() ? "Send message" : "Send like"}>
            {chatDraft.trim() ? "Send" : <ThumbIcon />}
          </button>
        </div>
        <button onClick={onCommit} disabled={saving} className="mt-3 w-full rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-blue-500 disabled:opacity-60">
          Make It Official
        </button>
      </div>
    </div>
  );
}
function OwnProfileCard({ profile, fallbackName, fallbackAge, fallbackCountry }: { profile?: DatingProfile; fallbackName: string; fallbackAge: number; fallbackCountry: string; }) {
  return <div className="mt-5 rounded-[1.8rem] border border-white/10 bg-white/5 p-4"><div className="flex gap-4"><div className="h-28 w-24 overflow-hidden rounded-[1.5rem] bg-white/10">{profile?.photo_url ? <img src={profile.photo_url} alt="Your dating profile" className="h-full w-full object-cover" /> : null}</div><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-black">{profile?.display_name || fallbackName}, {profile?.age || fallbackAge}</h3>{isProfileVerified(profile) ? <span className="rounded-full bg-sky-400 px-2 py-1 text-[10px] font-bold text-slate-950">Verified</span> : null}</div><p className="mt-2 text-sm text-white/65">{profile?.location_label || profile?.city || fallbackCountry}</p><p className="mt-3 text-sm text-white/80">{profile?.relationship_goal || "Still figuring it out"}</p></div></div><p className="mt-4 text-sm leading-7 text-white/80">{profile?.bio || "Finish your profile setup to appear in Swipe and Explore."}</p><div className="mt-4 flex flex-wrap gap-2">{(profile?.interests || []).map((interest) => <span key={interest} className="rounded-full bg-white/10 px-3 py-2 text-xs text-white/75">{interest}</span>)}</div></div>;
}
