export type SystemNotification = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

const icon = "/game-logo.png";

export const notificationsSupported = () =>
  typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

export async function registerNotificationWorker() {
  if (!notificationsSupported()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "denied" as NotificationPermission;
  if (Notification.permission === "granted") return "granted" as NotificationPermission;
  return Notification.requestPermission();
}

export async function showSystemNotification(notification: SystemNotification) {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;

  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(notification.title, {
    body: notification.body,
    tag: notification.tag,
    icon,
    badge: icon,
    data: { url: notification.url },
  });
}
