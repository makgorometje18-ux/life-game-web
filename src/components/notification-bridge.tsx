"use client";

import { useEffect } from "react";
import { registerNotificationWorker } from "@/lib/browser-notifications";

export function NotificationBridge() {
  useEffect(() => {
    void registerNotificationWorker();
  }, []);

  return null;
}
