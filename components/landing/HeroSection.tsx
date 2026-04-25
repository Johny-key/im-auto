"use client";

import { useState, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, ChevronRight, Zap } from "lucide-react";
import Image from "next/image";
import Button from "../ui/Button";
import ConsultationModal from "./ConsultationModal";

// Left headlight: double-blink
const LEFT_ANIMATE  = { opacity: [0, 1, 1, 0, 1, 1, 0, 0] };
const LEFT_TIMES    = [0, 0.02, 0.09, 0.11, 0.14, 0.23, 0.25, 1];
// Right headlight: double-blink offset
const RIGHT_ANIMATE = { opacity: [0, 0, 1, 1, 0, 1, 1, 0, 0] };
const RIGHT_TIMES   = [0, 0.30, 0.32, 0.40, 0.42, 0.45, 0.53, 0.55, 1];
const BLINK_DURATION = 5;

const speedLines = [
  { top: "12%",  width: "38%", delay: 0,    duration: 2.8 },
  { top: "24%",  width: "55%", delay: 1.1,  duration: 3.3 },
  { top: "38%",  width: "30%", delay: 0.5,  duration: 2.4 },
  { top: "53%",  width: "48%", delay: 1.8,  duration: 3.0 },
  { top: "67%",  width: "42%", delay: 0.9,  duration: 2.6 },
  { top: "80%",  width: "28%", delay: 2.3,  duration: 3.5 },
];

const stats = [
  { value: "500+", label: "авто доставлено" },
  { value: "7",    label: "лет на рынке" },
  { value: "100%", label: "довольных клиентов" },
];

export default function HeroSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const bgY   = useTransform(scrollYProgress, [0, 1], ["0%", "25%"]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);

  return (
    <>
      <section
        ref={sectionRef}
        className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0A0F1E]"
      >
        {/* ── Parallax background layer ── */}
        <motion.div className="absolute inset-0 pointer-events-none" style={{ y: bgY }}>
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(212,175,55,0.5) 1px, transparent 1px),
                linear-gradient(90deg, rgba(212,175,55,0.5) 1px, transparent 1px)
              `,
              backgroundSize: "80px 80px",
            }}
          />
          <div className="absolute inset-0 racing-stripe-bg" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1100px] h-[650px] rounded-full bg-[#D4AF37]/[0.05] blur-[130px]" />
          <div className="absolute top-1/4 right-1/3 w-[420px] h-[420px] rounded-full bg-[#1a2a6c]/12 blur-[90px]" />
        </motion.div>

        {/* ── BMW M5 image + headlight blink overlay ── */}
        <motion.div
          className="absolute inset-x-0 bottom-0 flex justify-center items-end pointer-events-none"
          style={{ y: bgY, mixBlendMode: "screen" }}
        >
          <div className="w-full max-w-[920px] relative">
            <Image
              src="/bmw-m5.png"
              alt="BMW M5"
              width={1092}
              height={1092}
              className="w-full h-auto opacity-60"
              priority
            />

            {/* SVG headlight glow — viewBox matches 1092×1092 image, paths trace the DRL lines */}
            <svg
              viewBox="0 0 1092 1092"
              fill="none"
              className="absolute inset-0 w-full h-full"
            >
              <defs>
                {/* Soft outer halo */}
                <filter id="drl-bloom" x="-120%" y="-120%" width="340%" height="340%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="18" />
                </filter>
                {/* Crisp inner glow */}
                <filter id="drl-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* ===== ЛЕВАЯ ФАРА ===== */}

              {/* Левая полоска */}
              <motion.path
                d="M 104,538 L 101,544 L 109,577 L 112,582 L 118,585 L 160,592 L 161,589 L 119,582 L 113,578 L 104,545"
                stroke="#FFE8A0" strokeWidth="28" fill="none" strokeLinecap="round" strokeLinejoin="round"
                filter="url(#drl-bloom)"
                initial={{ opacity: 0 }}
                animate={LEFT_ANIMATE}
                transition={{ duration: BLINK_DURATION, times: LEFT_TIMES, repeat: Infinity, ease: "linear" }}
              />
              <motion.path
                d="M 104,538 L 101,544 L 109,577 L 112,582 L 118,585 L 160,592 L 161,589 L 119,582 L 113,578 L 104,545"
                stroke="#FFFFFF" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"
                filter="url(#drl-glow)"
                initial={{ opacity: 0 }}
                animate={LEFT_ANIMATE}
                transition={{ duration: BLINK_DURATION, times: LEFT_TIMES, repeat: Infinity, ease: "linear" }}
              />

              {/* Правая полоска */}
              <motion.path
                d="M 163,551 L 162,553 L 174,589 L 176,593 L 181,594 L 258,605 L 258,602 L 187,593 L 180,590 L 167,556 L 166,552"
                stroke="#FFE8A0" strokeWidth="28" fill="none" strokeLinecap="round" strokeLinejoin="round"
                filter="url(#drl-bloom)"
                initial={{ opacity: 0 }}
                animate={LEFT_ANIMATE}
                transition={{ duration: BLINK_DURATION, times: LEFT_TIMES, repeat: Infinity, ease: "linear" }}
              />
              <motion.path
                d="M 163,551 L 162,553 L 174,589 L 176,593 L 181,594 L 258,605 L 258,602 L 187,593 L 180,590 L 167,556 L 166,552"
                stroke="#FFFFFF" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"
                filter="url(#drl-glow)"
                initial={{ opacity: 0 }}
                animate={LEFT_ANIMATE}
                transition={{ duration: BLINK_DURATION, times: LEFT_TIMES, repeat: Infinity, ease: "linear" }}
              />

              {/* ===== ПРАВАЯ ФАРА ===== */}

              {/* Левая полоска */}
              <motion.path
                d="M 987,539 L 989,542 L 982,579 L 976,584 L 930,592 L 930,590 L 974,581 L 977,577 L 987,543"
                stroke="#FFE8A0" strokeWidth="28" fill="none" strokeLinecap="round" strokeLinejoin="round"
                filter="url(#drl-bloom)"
                initial={{ opacity: 0 }}
                animate={RIGHT_ANIMATE}
                transition={{ duration: BLINK_DURATION, times: RIGHT_TIMES, repeat: Infinity, ease: "linear" }}
              />
              <motion.path
                d="M 987,539 L 989,542 L 982,579 L 976,584 L 930,592 L 930,590 L 974,581 L 977,577 L 987,543"
                stroke="#FFFFFF" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"
                filter="url(#drl-glow)"
                initial={{ opacity: 0 }}
                animate={RIGHT_ANIMATE}
                transition={{ duration: BLINK_DURATION, times: RIGHT_TIMES, repeat: Infinity, ease: "linear" }}
              />

              {/* Правая полоска */}
              <motion.path
                d="M 928,551 L 929,554 L 917,589 L 910,594 L 829,605 L 830,602 L 909,592 L 912,587 L 923,554 L 925,553"
                stroke="#FFE8A0" strokeWidth="28" fill="none" strokeLinecap="round" strokeLinejoin="round"
                filter="url(#drl-bloom)"
                initial={{ opacity: 0 }}
                animate={RIGHT_ANIMATE}
                transition={{ duration: BLINK_DURATION, times: RIGHT_TIMES, repeat: Infinity, ease: "linear" }}
              />
              <motion.path
                d="M 928,551 L 929,554 L 917,589 L 910,594 L 829,605 L 830,602 L 909,592 L 912,587 L 923,554 L 925,553"
                stroke="#FFFFFF" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"
                filter="url(#drl-glow)"
                initial={{ opacity: 0 }}
                animate={RIGHT_ANIMATE}
                transition={{ duration: BLINK_DURATION, times: RIGHT_TIMES, repeat: Infinity, ease: "linear" }}
              />
            </svg>
          </div>
        </motion.div>

        {/* ── Speed lines ── */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {speedLines.map((line, i) => (
            <div
              key={i}
              className="speed-line"
              style={{
                top: line.top,
                width: line.width,
                animationDuration: `${line.duration}s`,
                animationDelay: `${line.delay}s`,
              }}
            />
          ))}
        </div>

        {/* ── Diagonal racing accent – top right ── */}
        <div className="absolute top-0 right-0 w-64 h-64 pointer-events-none overflow-hidden hidden lg:block">
          {[0,1,2,3,4].map((i) => (
            <motion.div
              key={i}
              className="absolute h-px origin-right"
              style={{
                width: "200%", top: `${16 + i * 14}%`, right: 0,
                transform: "rotate(-40deg)",
                background: `linear-gradient(90deg, transparent, rgba(212,175,55,${0.06 + i * 0.03}))`,
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: 0.8 + i * 0.12, duration: 1.0 }}
            />
          ))}
        </div>

        {/* ── Ghost wordmark ── */}
        <div
          className="absolute bottom-0 left-0 right-0 font-display text-[22vw] leading-none select-none pointer-events-none text-center whitespace-nowrap overflow-hidden"
          style={{ color: "rgba(212,175,55,0.02)" }}
        >
          IM-AUTO
        </div>

        {/* ── Main content ── */}
        <motion.div
          className="relative z-10 max-w-6xl mx-auto px-6 text-center"
          style={{ y: textY }}
        >
          {/* Badge */}
          <motion.div
            className="flex items-center justify-center gap-3 mb-8"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65 }}
          >
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-[#D4AF37]" />
            <div className="flex items-center gap-2 border border-[#D4AF37]/30 px-4 py-1.5 bg-[#D4AF37]/[0.06] backdrop-blur-sm">
              <Zap size={11} className="text-[#D4AF37]" />
              <span className="text-[#D4AF37] text-[11px] tracking-[0.32em] uppercase font-display">
                Импорт автомобилей под ключ
              </span>
              <Zap size={11} className="text-[#D4AF37]" />
            </div>
            <div className="h-px w-10 bg-gradient-to-l from-transparent to-[#D4AF37]" />
          </motion.div>

          {/* Heading */}
          <div className="mb-6">
            {[
              { text: "ПРИВЕЗЁМ",      cls: "text-[#F0EDE8]", delay: 0.12 },
              { text: "ЛЮБОЙ АВТО",    cls: "shimmer-text",   delay: 0.24 },
              { text: "ИЗ-ЗА РУБЕЖА", cls: "text-[#F0EDE8]", delay: 0.36 },
            ].map(({ text, cls, delay }) => (
              <div key={text} className="overflow-hidden leading-[0.92]">
                <motion.div
                  className={`font-display text-[11vw] md:text-[9vw] lg:text-[7.5vw] ${cls} block`}
                  initial={{ y: "105%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
                >
                  {text}
                </motion.div>
              </div>
            ))}
          </div>

          {/* Sub-copy */}
          {/* TEMPORARILY HIDDEN — restore on command
          <motion.p
            className="text-[#8892A4] text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
          >
            Корея, Япония, Китай — официальная таможня, юридическая чистота и полное
            сопровождение от выбора до постановки на учёт
          </motion.p>
          */}

          {/* CTA */}
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.65 }}
          >
            <Button size="lg" onClick={() => setModalOpen(true)}>
              Получить консультацию
              <ChevronRight size={16} />
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => document.getElementById("categories")?.scrollIntoView({ behavior: "smooth" })}
            >
              Смотреть каталог
            </Button>
          </motion.div>

          {/* Stats */}
          <motion.div
            className="mt-20 flex items-stretch justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85, duration: 0.9 }}
          >
            {stats.map(({ value, label }, i) => (
              <div
                key={label}
                className={`text-center px-10 md:px-16 min-w-[140px] md:min-w-[180px] ${
                  i < stats.length - 1 ? "border-r border-[#D4AF37]/20" : ""
                }`}
              >
                <div className="font-display text-4xl md:text-5xl shimmer-text leading-none mb-2">
                  {value}
                </div>
                <div className="text-[#8892A4] text-[11px] uppercase tracking-[0.18em] leading-snug">
                  {label}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 cursor-pointer z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })}
        >
          <motion.div animate={{ y: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
            <ArrowDown size={15} className="text-[#D4AF37]" />
          </motion.div>
        </motion.div>
      </section>

      <ConsultationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
