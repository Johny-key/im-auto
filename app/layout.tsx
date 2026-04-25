import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoImport — Автомобили из-за границы под ключ",
  description: "Импорт автомобилей из Кореи, Японии и Китая. Гарантия юридической чистоты, таможня под ключ, доставка по всей России.",
  keywords: "импорт автомобилей, купить авто из Кореи, автомобили из Японии, растаможка под ключ",
  openGraph: {
    title: "AutoImport — Автомобили из-за границы под ключ",
    description: "Импорт автомобилей из Кореи, Японии и Китая с гарантией и таможней под ключ",
    type: "website",
    locale: "ru_RU",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
