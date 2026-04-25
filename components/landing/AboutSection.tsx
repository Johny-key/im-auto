"use client";

import { motion } from "framer-motion";
import { Shield, Award, Globe, Users } from "lucide-react";
import AnimatedCounter from "../ui/AnimatedCounter";
import SectionTitle from "../ui/SectionTitle";

const advantages = [
  { icon: Shield, text: "Официальная таможенная очистка по всем нормам РФ" },
  { icon: Award,  text: "Сертифицированные специалисты с опытом 5+ лет" },
  { icon: Globe,  text: "Прямые партнёрства с дилерами в 3 странах" },
  { icon: Users,  text: "Персональный менеджер на весь срок сделки" },
];

const stats = [
  { value: 500, suffix: "+", label: "авто доставлено",  sublabel: "за всё время работы" },
  { value: 7,   suffix: "",  label: "лет опыта",        sublabel: "на рынке импорта" },
  { value: 3,   suffix: "",  label: "страны",           sublabel: "Корея, Япония, Китай" },
  { value: 100, suffix: "%", label: "довольны",         sublabel: "рекомендуют нас друзьям" },
];

export default function AboutSection() {
  return (
    <section id="about" className="py-28 bg-[#0A0F1E] relative overflow-hidden">
      {/* Background accent blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#D4AF37]/[0.04] blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-[#1a2a6c]/10 blur-[80px] pointer-events-none" />

      {/* Racing stripes */}
      <div className="absolute inset-0 racing-stripe-bg opacity-40 pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <SectionTitle
          label="О компании"
          title="МЫ ЗНАЕМ"
          highlight="КАК ЭТО РАБОТАЕТ"
        />

        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left — text */}
          <div>
            <motion.p
              className="text-[#8892A4] text-lg leading-relaxed mb-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              С 2019 года мы помогаем россиянам приобретать автомобили из Кореи, Японии и Китая.
              Берём на себя всё: поиск, проверку, выкуп, доставку, растаможку и постановку на учёт.
              Вы просто выбираете авто — остальное наша работа.
            </motion.p>

            <div className="space-y-5">
              {advantages.map((adv, i) => (
                <motion.div
                  key={i}
                  className="flex items-center gap-5 group"
                  initial={{ opacity: 0, x: -24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 * i }}
                >
                  <div className="shrink-0 w-11 h-11 border border-[#D4AF37]/30 flex items-center justify-center
                    group-hover:border-[#D4AF37]/65 group-hover:shadow-[0_0_12px_rgba(212,175,55,0.12)] transition-all duration-300">
                    <adv.icon size={18} className="text-[#D4AF37]" />
                  </div>
                  <p className="text-[#8892A4] text-sm leading-relaxed">{adv.text}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Right — stats grid */}
          <div className="grid grid-cols-2 gap-4">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                className="group relative bg-[#0F1629] border border-[rgba(212,175,55,0.1)] p-6 overflow-hidden neon-border"
                initial={{ opacity: 0, scale: 0.94 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 * i }}
                whileHover={{ y: -3 }}
              >
                {/* Subtle racing stripe inside card on hover */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(212,175,55,0.025) 10px, rgba(212,175,55,0.025) 20px)",
                  }}
                />

                {/* Corner accent */}
                <div className="absolute top-0 right-0 w-10 h-10">
                  <div className="absolute top-0 right-0 w-full h-[1.5px] bg-[#D4AF37]/25 group-hover:bg-[#D4AF37]/55 transition-colors duration-300" />
                  <div className="absolute top-0 right-0 h-full w-[1.5px] bg-[#D4AF37]/25 group-hover:bg-[#D4AF37]/55 transition-colors duration-300" />
                </div>

                <div className="font-display text-5xl shimmer-text mb-1 relative z-10">
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-[#F0EDE8] font-semibold text-sm uppercase tracking-wider mb-1 relative z-10">
                  {stat.label}
                </div>
                <div className="text-[#8892A4] text-xs relative z-10">{stat.sublabel}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom gold line */}
      <div className="absolute bottom-0 left-0 right-0 gold-line opacity-30" />
    </section>
  );
}
