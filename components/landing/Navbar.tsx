"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Phone } from "lucide-react";

const navItems = [
  { label: "О нас", href: "#about" },
  { label: "Как работаем", href: "#process" },
  { label: "Каталог", href: "#categories" },
  { label: "Примеры работ", href: "#works" },
  { label: "Отзывы", href: "#reviews" },
  { label: "Контакты", href: "#contacts" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <motion.header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-[#0A0F1E]/95 backdrop-blur-md border-b border-[rgba(212,175,55,0.1)]" : "bg-transparent"
        }`}
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="max-w-6xl mx-auto px-6 h-18 flex items-center justify-between py-4">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2">
            <div className="w-8 h-8 border-2 border-[#D4AF37] rotate-45 flex items-center justify-center">
              <div className="w-3 h-3 bg-[#D4AF37]" />
            </div>
            <span className="font-display text-2xl text-[#F0EDE8] tracking-wider">IM-<span className="text-[#D4AF37]">AUTO</span></span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-8">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm text-[#8892A4] hover:text-[#D4AF37] transition-colors duration-200 tracking-wide uppercase"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Phone + mobile menu */}
          <div className="flex items-center gap-4">
            <a href="tel:+79001234567" className="hidden md:flex items-center gap-2 text-[#D4AF37] text-sm font-medium hover:text-[#F0D060] transition-colors">
              <Phone size={14} />
              +7 (900) 123-45-67
            </a>
            <button onClick={() => setOpen(!open)} className="lg:hidden text-[#F0EDE8] hover:text-[#D4AF37] transition-colors">
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-40 bg-[#0A0F1E]/98 backdrop-blur-lg flex flex-col items-center justify-center gap-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {navItems.map((item, i) => (
              <motion.a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="font-display text-4xl text-[#F0EDE8] hover:text-[#D4AF37] transition-colors"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                {item.label}
              </motion.a>
            ))}
            <a href="tel:+79001234567" className="mt-4 text-[#D4AF37] text-lg">
              +7 (900) 123-45-67
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
