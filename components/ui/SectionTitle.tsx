"use client";

import { motion } from "framer-motion";

interface SectionTitleProps {
  label?: string;
  title: string;
  highlight?: string;
  subtitle?: string;
  align?: "left" | "center";
}

export default function SectionTitle({
  label,
  title,
  highlight,
  subtitle,
  align = "center",
}: SectionTitleProps) {
  const isCenter = align === "center";

  return (
    <motion.div
      className={`mb-14 ${isCenter ? "text-center" : "text-left"}`}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      {/* Label badge */}
      {label && (
        <div className={`flex items-center gap-3 mb-5 ${isCenter ? "justify-center" : ""}`}>
          <div className="h-px w-8 bg-[#D4AF37]" />
          <span className="text-[#D4AF37] text-[11px] font-display tracking-[0.28em] uppercase">
            {label}
          </span>
          <div className="h-px w-8 bg-[#D4AF37]" />
        </div>
      )}

      {/* Heading — title and highlight always on separate lines so Montserrat 900 doesn't overflow */}
      <h2 className="font-display leading-[1.0] text-[#F0EDE8]">
        <span className="block text-4xl md:text-5xl lg:text-[3.5rem]">{title}</span>
        {highlight && (
          <span className="block text-4xl md:text-5xl lg:text-[3.5rem] shimmer-text mt-1">
            {highlight}
          </span>
        )}
      </h2>

      {/* Subtitle */}
      {subtitle && (
        <p
          className={`mt-5 text-[#8892A4] text-base md:text-lg leading-relaxed max-w-2xl ${
            isCenter ? "mx-auto" : ""
          }`}
        >
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}
