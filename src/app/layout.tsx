import type { Metadata } from "next";
import { AudioController } from "@/components/audio-controller";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life Game Africa",
  description: "Build your character, live your choices, and shape your story.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <AudioController />
      </body>
    </html>
  );
}
