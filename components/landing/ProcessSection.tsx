"use client";

import { motion, useInView } from "framer-motion";
import { Search, FileCheck, Truck, Package, CheckCircle } from "lucide-react";
import { useRef } from "react";
import SectionTitle from "../ui/SectionTitle";

const steps = [
  {
    icon: Search,
    number: "01",
    title: "Подбор автомобиля",
    description: "Анализируем ваши пожелания, бюджет и предпочтения. Подбираем варианты на площадках и согласовываем выбор.",
  },
  {
    icon: FileCheck,
    number: "02",
    title: "Проверка и выкуп",
    description: "Проводим техническую и юридическую проверку авто. После согласования — выкупаем автомобиль у продавца.",
  },
  {
    icon: Truck,
    number: "03",
    title: "Доставка в РФ",
    description: "Организуем транспортировку автомобиля до границы РФ. Отслеживаем груз и держим вас в курсе.",
  },
  {
    icon: Package,
    number: "04",
    title: "Таможенное оформление",
    description: "Полностью берём на себя таможенную очистку, уплату всех сборов и пошлин согласно законодательству РФ.",
  },
  {
    icon: CheckCircle,
    number: "05",
    title: "Получение авто",
    description: "Передаём автомобиль с полным пакетом документов. При необходимости — помогаем с постановкой на учёт.",
  },
];

export default function ProcessSection() {
  const lineRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(lineRef, { once: true, margin: "-100px" });

  return (
    <section id="process" className="py-28 relative overflow-hidden" style={{ background: "#0D1426" }}>
      {/* Racing stripe texture */}
      <div className="absolute inset-0 racing-stripe-bg opacity-70 pointer-events-none" />

      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(212,175,55,0.04) 0%, transparent 65%)" }}
      />

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <SectionTitle
          label="Как мы работаем"
          title="ПРОСТОЙ ПРОЦЕСС"
          highlight="ОТ А ДО Я"
          subtitle="5 шагов от выбора до получения ключей. Без лишних сложностей."
        />

        {/* Steps */}
        <div className="relative" ref={lineRef}>
          {/* ── Desktop connector track ── */}
          <div className="hidden lg:block absolute top-16 left-0 right-0">
            {/* Track background */}
            <div className="absolute inset-0 h-px bg-[#D4AF37]/10" />
            {/* Animated progress fill */}
            <motion.div
              className="absolute left-0 top-0 h-px"
              style={{ background: "linear-gradient(90deg, #A88A1A, #D4AF37, #F0D060)" }}
              initial={{ width: "0%" }}
              animate={{ width: isInView ? "100%" : "0%" }}
              transition={{ duration: 1.6, delay: 0.4, ease: "easeInOut" }}
            />
            {/* Dashed overlay for racing-track feel */}
            <div
              className="absolute inset-0 h-px opacity-30"
              style={{
                backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 8px, #D4AF37 8px, #D4AF37 14px)",
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                className="relative flex flex-col items-center text-center"
                initial={{ opacity: 0, y: 36 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.55 }}
              >
                {/* Ghost step number — large background */}
                <div
                  className="absolute -top-5 left-1/2 -translate-x-1/2 font-display leading-none select-none pointer-events-none"
                  style={{ fontSize: "6rem", color: "rgba(212,175,55,0.06)" }}
                >
                  {step.number}
                </div>

                {/* Icon container */}
                <motion.div
                  className="relative mb-6 z-10 group/icon"
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="w-[60px] h-[60px] border-2 border-[#D4AF37]/50 bg-[#0A0F1E] flex items-center justify-center rotate-45 relative z-10
                    transition-all duration-300 group-hover/icon:border-[#D4AF37] group-hover/icon:shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                    <step.icon size={22} className="text-[#D4AF37] -rotate-45" />
                  </div>
                  {/* Outer glow ring on hover */}
                  <div className="absolute inset-0 rotate-45 border border-[#D4AF37]/0 group-hover/icon:border-[#D4AF37]/30 transition-all duration-300 scale-[1.3]" />
                </motion.div>

                <h3 className="font-display text-base text-[#F0EDE8] mb-3 tracking-wide leading-snug px-1">{step.title}</h3>
                <p className="text-[#8892A4] text-xs leading-relaxed px-1">{step.description}</p>

                {/* Mobile connector */}
                {i < steps.length - 1 && (
                  <div className="lg:hidden flex flex-col items-center mt-6 gap-1">
                    {[0,1,2].map((dot) => (
                      <div key={dot} className="w-1 h-1 rounded-full bg-[#D4AF37]/30" />
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          className="mt-20 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-[#8892A4] mb-6">
            Среднее время доставки:{" "}
            <span className="shimmer-text font-semibold">30–45 дней</span>
          </p>
          <a
            href="#contacts"
            className="inline-flex items-center gap-2 text-[#D4AF37] border border-[#D4AF37]/40 px-8 py-3 text-sm uppercase tracking-widest hover:bg-[#D4AF37]/10 transition-colors neon-border"
          >
            Начать сейчас
          </a>
        </motion.div>
      </div>
    </section>
  );
}
