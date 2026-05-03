"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import SectionTitle from "../ui/SectionTitle";
import worksData from "@/data/works.json";

const works = worksData;

const categoryColors: Record<string, string> = {
  "Эконом":  "#4ade80",
  "Комфорт": "#60a5fa",
  "Бизнес":  "#c084fc",
  "Премиум": "#D4AF37",
};

type Work = typeof works[number];

function CarouselModal({ work, onClose }: { work: Work; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const total = work.photos.length;

  const go = useCallback((dir: number) => {
    setDirection(dir);
    setIndex((prev) => (prev + dir + total) % total);
  }, [total]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const accentColor = categoryColors[work.category] ?? "#D4AF37";

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

      <motion.div
        className="relative z-10 w-full max-w-3xl bg-[#0F1629] border border-[rgba(212,175,55,0.15)] overflow-hidden"
        initial={{ scale: 0.93, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.93, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-1.5 bg-black/50 text-[#8892A4] hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        {/* Photo area */}
        <div className="relative w-full h-[420px] overflow-hidden bg-black">
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={index}
              custom={direction}
              variants={{
                enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              <Image
                src={work.photos[index]}
                alt={`${work.brand} ${work.model} — фото ${index + 1}`}
                fill
                className="object-cover"
                sizes="768px"
              />
            </motion.div>
          </AnimatePresence>

          <div className="absolute inset-0 pointer-events-none" style={{
            background: "linear-gradient(to bottom, rgba(10,15,30,0.15) 0%, rgba(15,22,41,0.6) 100%)",
          }} />

          {total > 1 && (
            <>
              <button
                onClick={() => go(-1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white hover:bg-[#D4AF37]/30 hover:text-[#D4AF37] transition-colors"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                onClick={() => go(1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white hover:bg-[#D4AF37]/30 hover:text-[#D4AF37] transition-colors"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}

          {total > 1 && (
            <div className="absolute bottom-3 right-3 text-[11px] text-white/70 bg-black/50 px-2.5 py-1 tracking-wider font-display">
              {index + 1} / {total}
            </div>
          )}

          {total > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {work.photos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setDirection(i > index ? 1 : -1); setIndex(i); }}
                  className="w-1.5 h-1.5 rounded-full transition-all duration-200"
                  style={{ background: i === index ? accentColor : "rgba(255,255,255,0.3)" }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-display text-xl text-[#F0EDE8] tracking-wide">
                {work.brand}{" "}
                <span className="text-[#8892A4] text-base">{work.model}</span>
              </div>
              <div className="text-[#8892A4] text-xs mt-0.5 tracking-wider">
                {work.year} год · {work.country} · {work.mileage}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[#8892A4] text-[11px] uppercase tracking-wider mb-0.5">Итоговая цена</div>
              <div className="font-bold text-lg shimmer-text">{work.price}</div>
            </div>
          </div>

          {/* Specs */}
          <div
            className="text-[12px] text-[#8892A4] tracking-wide px-3 py-2"
            style={{ background: "rgba(212,175,55,0.04)", borderLeft: `2px solid ${accentColor}40` }}
          >
            {work.specs}
          </div>
        </div>

        <div className="h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />
      </motion.div>
    </motion.div>
  );
}

export default function WorksSection() {
  const [selected, setSelected] = useState<Work | null>(null);

  return (
    <section id="works" className="py-28 bg-[#0A0F1E] relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <SectionTitle
          label="Примеры работ"
          title="УЖЕ"
          highlight="ДОСТАВЛЕНО"
          subtitle="Реальные автомобили, которые мы привезли нашим клиентам"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {works.map((car, i) => {
            const accentColor = categoryColors[car.category] ?? "#D4AF37";
            return (
              <motion.div
                key={i}
                className="group relative bg-[#0F1629] border border-[rgba(212,175,55,0.08)] overflow-hidden neon-border cursor-pointer"
                initial={{ opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -5 }}
                onClick={() => setSelected(car)}
              >
                {/* Photo */}
                <div className="relative w-full h-48 overflow-hidden">
                  <Image
                    src={car.photos[0]}
                    alt={`${car.brand} ${car.model}`}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />

                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(to bottom, rgba(10,15,30,0.1) 0%, rgba(10,15,30,0.55) 70%, rgba(15,22,41,0.9) 100%)",
                    }}
                  />

                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      backgroundImage: "repeating-linear-gradient(-60deg, transparent, transparent 20px, rgba(212,175,55,0.04) 20px, rgba(212,175,55,0.04) 21px)",
                    }}
                  />

                  {car.photos.length > 1 && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] text-white/70 bg-black/50 px-2 py-0.5 tracking-wider font-display">
                      ⬡ {car.photos.length} фото
                    </div>
                  )}

                  <div className="absolute top-3 left-3 text-[11px] text-[#8892A4] border border-[#8892A4]/20 px-2.5 py-1 bg-[#0A0F1E]/70 backdrop-blur-sm font-display tracking-wider">
                    {car.country}
                  </div>

                  <div
                    className="absolute top-3 right-3 text-[11px] px-2.5 py-1 font-display tracking-wider backdrop-blur-sm"
                    style={{
                      color: accentColor,
                      border: `1px solid ${accentColor}35`,
                      background: `${accentColor}12`,
                    }}
                  >
                    {car.category}
                  </div>
                </div>

                {/* Info */}
                <div className="p-5">
                  <div className="font-display text-xl text-[#F0EDE8] tracking-wide mb-0.5">
                    {car.brand}{" "}
                    <span className="text-[#8892A4] text-base">{car.model}</span>
                  </div>
                  <div className="text-[#8892A4] text-xs tracking-wider mb-3">
                    {car.year} год · {car.mileage}
                  </div>

                  <div className="text-[11px] text-[#8892A4]/80 tracking-wide mb-3 truncate">
                    {car.specs}
                  </div>

                  <div
                    className="h-px mb-3"
                    style={{ background: `linear-gradient(90deg, ${accentColor}30, transparent)` }}
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-[#8892A4] text-[11px] uppercase tracking-wider">Итоговая цена</span>
                    <span className="font-bold text-base shimmer-text">{car.price}</span>
                  </div>
                </div>

                <div
                  className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
                />
              </motion.div>
            );
          })}
        </div>

        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <a
            href="/catalog"
            className="inline-flex items-center gap-2 text-[#D4AF37] border border-[#D4AF37]/40 px-8 py-3 text-sm uppercase tracking-widest hover:bg-[#D4AF37]/10 transition-colors neon-border"
          >
            Смотреть весь каталог
          </a>
        </motion.div>
      </div>

      <AnimatePresence>
        {selected && (
          <CarouselModal work={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </section>
  );
}
