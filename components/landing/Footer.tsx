"use client";

import { Phone, Mail, MessageCircle, MapPin } from "lucide-react";
import { useEffect, useState } from "react";

const articleLinks = [
  { label: "Авто из Кореи",      href: "/avto-iz-korei" },
  { label: "Авто из Японии",     href: "/avto-iz-yaponii" },
  { label: "Авто из Китая",      href: "/avto-iz-kitaya" },
  { label: "Доставка авто",      href: "/dostavka-avtomobiley" },
  { label: "Растаможка",         href: "/rastamojka-avtomobilya" },
  { label: "Авто с аукционов",   href: "/avto-s-aukcionov" },
  { label: "Авто из Киргизии",   href: "/avto-iz-kirgizii" },
  { label: "Авто из Казахстана", href: "/avto-iz-kazahstana" },
  { label: "Авто из Беларуси",   href: "/avto-iz-belarusi" },
];

const navLinks = [
  { label: "О компании",    href: "#about" },
  { label: "Как работаем", href: "#process" },
  { label: "Каталог",      href: "/catalog" },
  { label: "Примеры работ",href: "#works" },
  { label: "Отзывы",       href: "#reviews" },
  { label: "Контакты",     href: "#contacts" },
];

export default function Footer() {
  const [phone, setPhone]       = useState("+7 (900) 123-45-67");
  const [email, setEmail]       = useState("info@autoimport.ru");
  const [telegram, setTelegram] = useState("https://t.me/autoimport_ru");

  useEffect(() => {
    fetch("/api/catalog/contacts")
      .then(r => r.json())
      .then(d => {
        if (d.phone)    setPhone(d.phone);
        if (d.email)    setEmail(d.email);
        if (d.telegram) setTelegram(d.telegram);
      })
      .catch(() => {});
  }, []);

  const phoneDigits = phone.replace(/\D/g, "");

  return (
    <footer className="bg-white border-t border-[#DDE5F2]">
      {/* Main footer body */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

          {/* Column 1 — Brand + tagline */}
          <div>
            <a href="/" className="flex items-center mb-4">
              <img
                src="/logo.svg"
                alt="Im-AUTO"
                className="h-10 w-auto"
                style={{ filter: "none" }}
              />
            </a>
            <p className="text-[#6B7A96] text-sm leading-relaxed max-w-xs">
              Импорт автомобилей из Кореи, Японии и Китая. Под ключ: поиск, выкуп, доставка, таможня.
            </p>
            <div className="mt-5 flex items-center gap-2 text-xs text-[#A0AAB8]">
              <MapPin size={13} />
              <span>г. Москва · Пн–Пт 9:00–20:00</span>
            </div>
          </div>

          {/* Column 2 — Navigation */}
          <div>
            <div className="text-[11px] font-display tracking-[0.24em] uppercase text-[#C9A227] mb-5">
              Навигация
            </div>
            <ul className="space-y-3">
              {navLinks.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-sm text-[#46536A] hover:text-[#C9A227] transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 — Articles */}
          <div>
            <div className="text-[11px] font-display tracking-[0.24em] uppercase text-[#C9A227] mb-5">
              Статьи
            </div>
            <ul className="space-y-3">
              {articleLinks.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-sm text-[#46536A] hover:text-[#C9A227] transition-colors"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4 — Contacts */}
          <div>
            <div className="text-[11px] font-display tracking-[0.24em] uppercase text-[#C9A227] mb-5">
              Связаться
            </div>
            <div className="space-y-3">
              <a
                href={`tel:+${phoneDigits}`}
                className="flex items-center gap-3 text-sm text-[#46536A] hover:text-[#1B3260] transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#EBF0FA] flex items-center justify-center shrink-0 group-hover:bg-[#1B3260] transition-colors">
                  <Phone size={14} className="text-[#1B3260] group-hover:text-white transition-colors" />
                </div>
                {phone}
              </a>
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-3 text-sm text-[#46536A] hover:text-[#C9A227] transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#FFFBEB] flex items-center justify-center shrink-0 group-hover:bg-[#C9A227] transition-colors">
                  <Mail size={14} className="text-[#C9A227] group-hover:text-white transition-colors" />
                </div>
                {email}
              </a>
              {telegram && (
                <a
                  href={telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm text-[#46536A] hover:text-[#0891B2] transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#ECFEFF] flex items-center justify-center shrink-0 group-hover:bg-[#0891B2] transition-colors">
                    <MessageCircle size={14} className="text-[#0891B2] group-hover:text-white transition-colors" />
                  </div>
                  Telegram
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[#DDE5F2] bg-[#F5F7FC]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[#A0AAB8] text-xs">
            © {new Date().getFullYear()} IM-Auto. Все права защищены.
          </span>
          <a href="/privacy" className="text-[#A0AAB8] text-xs hover:text-[#46536A] transition-colors">
            Политика конфиденциальности
          </a>
        </div>
      </div>
    </footer>
  );
}
