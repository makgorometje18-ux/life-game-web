"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Notice = {
  id: string;
  title: string;
  text: string;
};

const FEATURE_VERSION = "2026-04-14-education-phase-1";
const FEATURE_TITLE = "New Features Available";
const FEATURE_TEXT = "Education now has playable campus zones, session progress, and a smarter mobile layout.";

const pathLabel = (pathname: string) => {
  if (pathname.startsWith("/game/education")) return "Cape Town CBD Campus";
  if (pathname.startsWith("/game")) return "your main story";
  if (pathname.startsWith("/auth")) return "the login screen";
  return "Life Game Africa";
};

export function AppNotifications() {
  const pathname = usePathname();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [notices, setNotices] = useState<Notice[]>([]);

  const currentLabel = useMemo(() => pathLabel(pathname), [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const now = Date.now();
    const lastScene = window.localStorage.getItem("life:last-scene");
    const lastSceneAt = Number(window.localStorage.getItem("life:last-scene-at") || "0");
    const lastFeatureVersion = window.localStorage.getItem("life:last-feature-version");
    const nextNotices: Notice[] = [];

    if (lastFeatureVersion !== FEATURE_VERSION) {
      nextNotices.push({
        id: "feature-update",
        title: FEATURE_TITLE,
        text: FEATURE_TEXT,
      });
      window.localStorage.setItem("life:last-feature-version", FEATURE_VERSION);
    }

    if (lastScene && lastScene !== currentLabel && lastSceneAt && now - lastSceneAt > 15 * 60 * 1000) {
      nextNotices.push({
        id: "return-reminder",
        title: "Your Character Is Waiting",
        text: `You last left the game at ${lastScene}. Jump back in and continue your story.`,
      });
    }

    if (nextNotices.length > 0) {
      setNotices((current) => {
        const ids = new Set(current.map((notice) => notice.id));
        return [...current, ...nextNotices.filter((notice) => !ids.has(notice.id))];
      });
    }

    window.localStorage.setItem("life:last-scene", currentLabel);
    window.localStorage.setItem("life:last-scene-at", String(now));
  }, [currentLabel]);

  useEffect(() => {
    if (permission !== "granted" || notices.length === 0 || typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    notices.forEach((notice) => {
      new Notification(notice.title, { body: notice.text, tag: notice.id });
    });
  }, [notices, permission]);

  const requestNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const dismissNotice = (id: string) => {
    setNotices((current) => current.filter((notice) => notice.id !== id));
  };

  return (
    <>
      {permission !== "granted" ? (
        <button
          type="button"
          onClick={() => void requestNotifications()}
          className="fixed bottom-4 right-4 z-[70] rounded-full border border-white/15 bg-black/75 px-4 py-3 text-sm font-semibold text-white shadow-xl backdrop-blur transition hover:bg-black/85"
        >
          Turn On Reminders
        </button>
      ) : null}

      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex max-w-sm flex-col gap-3">
        {notices.map((notice) => (
          <div key={notice.id} className="pointer-events-auto rounded-[1.5rem] border border-white/10 bg-black/80 p-4 text-white shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.22em] text-amber-200">{notice.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-200">{notice.text}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissNotice(notice.id)}
                className="rounded-full border border-white/10 px-2 py-1 text-xs text-stone-300 transition hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
