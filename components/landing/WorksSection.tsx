"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import SectionTitle from "../ui/SectionTitle";

const works = [
  {
    brand: "Genesis",
    model: "GV80 3.5T AWD",
    year: 2023,
    price: "5 850 000 ₽",
    country: "Корея",
    category: "Премиум",
    photo: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80&auto=format&fit=crop",
  },
  {
    brand: "Hyundai",
    model: "Tucson 1.6 T-GDi",
    year: 2023,
    price: "2 390 000 ₽",
    country: "Корея",
    category: "Комфорт",
    photo: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=600&q=80&auto=format&fit=crop",
  },
  {
    brand: "Kia",
    model: "Sportage GT Line",
    year: 2024,
    price: "2 750 000 ₽",
    country: "Корея",
    category: "Комфорт",
    photo: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80&auto=format&fit=crop",
  },
  {
    brand: "Toyota",
    model: "Land Cruiser 300",
    year: 2022,
    price: "8 200 000 ₽",
    country: "Япония",
    category: "Премиум",
    photo: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=600&q=80&auto=format&fit=crop",
  },
  {
    brand: "Hyundai",
    model: "Elantra 2.0 AT",
    year: 2023,
    price: "1 380 000 ₽",
    country: "Корея",
    category: "Эконом",
    photo: "https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=600&q=80&auto=format&fit=crop",
  },
  {
    brand: "Genesis",
    model: "G80 2.5T AWD",
    year: 2023,
    price: "4 650 000 ₽",
    country: "Корея",
    category: "Бизнес",
    photo: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80&auto=format&fit=crop",
  },
];

const categoryColors: Record<string, string> = {
  "Эконом":  "#4ade80",
  "Комфорт": "#60a5fa",
  "Бизнес":  "#c084fc",
  "Премиум": "#D4AF37",
};

export default function WorksSection() {
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
                className="group relative bg-[#0F1629] border border-[rgba(212,175,55,0.08)] overflow-hidden neon-border"
                initial={{ opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -5 }}
              >
                {/* Photo */}
                <div className="relative w-full h-48 overflow-hidden">
                  <Image
                    src={car.photo}
                    alt={`${car.brand} ${car.model}`}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-108"
                    style={{ transitionDuration: "700ms" }}
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />

                  {/* Gradient overlay */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(to bottom, rgba(10,15,30,0.1) 0%, rgba(10,15,30,0.55) 70%, rgba(15,22,41,0.9) 100%)",
                    }}
                  />

                  {/* Racing stripe on photo hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      backgroundImage: "repeating-linear-gradient(-60deg, transparent, transparent 20px, rgba(212,175,55,0.04) 20px, rgba(212,175,55,0.04) 21px)",
                    }}
                  />

                  {/* Country badge */}
                  <div className="absolute top-3 left-3 text-[11px] text-[#8892A4] border border-[#8892A4]/20 px-2.5 py-1 bg-[#0A0F1E]/70 backdrop-blur-sm font-display tracking-wider">
                    {car.country}
                  </div>

                  {/* Category badge */}
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
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-display text-xl text-[#F0EDE8] tracking-wide">
                        {car.brand}{" "}
                        <span className="text-[#8892A4] text-base">{car.model}</span>
                      </div>
                      <div className="text-[#8892A4] text-xs mt-0.5 tracking-wider">{car.year} год</div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div
                    className="h-px my-3 transition-all duration-300"
                    style={{
                      background: `linear-gradient(90deg, ${accentColor}30, transparent)`,
                    }}
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-[#8892A4] text-[11px] uppercase tracking-wider">Итоговая цена</span>
                    <span className="font-bold text-base shimmer-text">{car.price}</span>
                  </div>
                </div>

                {/* Bottom accent line — colored by category */}
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
    </section>
  );
}
