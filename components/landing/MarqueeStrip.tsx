"use client";

import { motion } from "framer-motion";

const items = [
  "KIA", "HYUNDAI", "TOYOTA", "GENESIS", "LEXUS", "HONDA", "MAZDA",
  "КОРЕЯ", "ЯПОНИЯ", "КИТАЙ",
  "500+ АВТО", "7 ЛЕТ ОПЫТА", "ТАМОЖНЯ ПОД КЛЮЧ", "ОФИЦИАЛЬНЫЙ ИМПОРТ",
];

const SEP = "◆";

export default function MarqueeStrip({ reversed = false }: { reversed?: boolean }) {
  const doubled = [...items, ...items];

  return (
    <div className="relative overflow-hidden bg-[#070B14] border-y border-[#D4AF37]/15 py-3 select-none">
      {/* Left / right fade masks */}
      <div className="absolute left-0 top-0 bottom-0 w-20 z-10 pointer-events-none"
        style={{ background: "linear-gradient(90deg, #070B14, transparent)" }} />
      <div className="absolute right-0 top-0 bottom-0 w-20 z-10 pointer-events-none"
        style={{ background: "linear-gradient(-90deg, #070B14, transparent)" }} />

      <motion.div
        className="flex gap-0 whitespace-nowrap will-change-transform"
        animate={{ x: reversed ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      >
        {doubled.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-4 text-[11px] font-display tracking-[0.28em]">
            <span className="text-[#D4AF37]/65 hover:text-[#D4AF37] transition-colors duration-200 px-4">
              {item}
            </span>
            <span className="text-[#D4AF37]/20 text-[8px]">{SEP}</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}
