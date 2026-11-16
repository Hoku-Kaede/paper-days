import type { Metadata, Viewport } from "next";
import {
  Architects_Daughter,
  Caveat,
  Gloria_Hallelujah,
  Homemade_Apple,
  Indie_Flower,
  Kalam,
  Nanum_Pen_Script,
  Patrick_Hand,
  Reenie_Beanie,
  Shantell_Sans,
} from "next/font/google";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

/* Three hands in the diary:
   Caveat  — the confident marker hand (dates, titles) */
const hand = Caveat({
  subsets: ["latin"],
  variable: "--font-hand-g",
  display: "swap",
});

/* Kalam   — the pen that writes the pages */
const pen = Kalam({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-pen-g",
  display: "swap",
});

/* Reenie Beanie — the hasty ballpoint for notes & captions */
const note = Reenie_Beanie({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-note-g",
  display: "swap",
});

/* ---- the other hands, for when the book's written in another mood ----
   They aren't preloaded: a book only fetches the hand it's wearing. */

const neatHand = Architects_Daughter({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-neat-hand-g",
  display: "swap",
  preload: false,
});
const neatPen = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-neat-pen-g",
  display: "swap",
  preload: false,
});

const markerHand = Shantell_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-marker-hand-g",
  display: "swap",
  preload: false,
});
const markerPen = Gloria_Hallelujah({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-marker-pen-g",
  display: "swap",
  preload: false,
});

const casualHand = Indie_Flower({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-casual-hand-g",
  display: "swap",
  preload: false,
});
const casualPen = Homemade_Apple({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-casual-pen-g",
  display: "swap",
  preload: false,
});
const casualNote = Nanum_Pen_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-casual-note-g",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ching-diary.vercel.app"),
  title: {
    default: "Ching's Diary ka ba? — a diary, kept the scrapbook way",
    template: "%s · Ching's Diary",
  },
  description:
    "Write today's page on ruled paper, tape in photos and videos, and let the month gather up what happened. A diary that looks like one.",
  applicationName: "Ching's Diary",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // the installed app: its own name, no browser chrome
  appleWebApp: {
    capable: true,
    title: "Ching's Diary",
    statusBarStyle: "default",
  },
  other: {
    // older iOS still looks for this one
    "apple-mobile-web-app-capable": "yes",
  },
  openGraph: {
    title: "Ching's Diary ka ba? — a diary, kept the scrapbook way",
    description:
      "Ruled pages, ballpoint ink, washi tape. Write the day, stick in the pictures.",
    type: "website",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4d3a27" },
    { media: "(prefers-color-scheme: dark)", color: "#2a1f16" },
  ],
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${hand.variable} ${pen.variable} ${note.variable} ${neatHand.variable} ${neatPen.variable} ${markerHand.variable} ${markerPen.variable} ${casualHand.variable} ${casualPen.variable} ${casualNote.variable}`}
    >
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
