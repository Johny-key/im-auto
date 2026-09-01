export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Купить и привезти авто из-за границы в Россию под ключ от Im-Auto",
  description: "Подберем и проверим автомобиль в Корее, Японии, Китае или Европе, согласуем расчет, организуем выкуп, доставку и таможенное оформление. Изучите каталог и получите консультацию по покупке авто из-за границы.",
};

import Navbar from "@/components/landing/Navbar";
import FloatingButtons from "@/components/landing/FloatingButtons";
import HeroSection from "@/components/landing/HeroSection";
import MarqueeStrip from "@/components/landing/MarqueeStrip";
import AboutSection from "@/components/landing/AboutSection";
import ProcessSection from "@/components/landing/ProcessSection";
import CategoriesSection from "@/components/landing/CategoriesSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import WorksSection from "@/components/landing/WorksSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import ContactSection from "@/components/landing/ContactSection";
import Footer from "@/components/landing/Footer";
import SeoContentHome11 from "@/components/landing/SeoContentHome11";
export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <HeroSection />
      <MarqueeStrip />
      <AboutSection />

      {/* Telegram channel CTA */}
      <section className="py-8 bg-white">
        <div className="max-w-6xl mx-auto px-6 flex justify-center">
          <a
            href="https://t.me/imautoru"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-[#229ED9] hover:bg-[#1a8fc4] active:bg-[#157aaa] text-white font-bold text-lg px-10 py-5 rounded-2xl shadow-[0_8px_32px_rgba(34,158,217,0.45)] transition-all duration-200 hover:shadow-[0_12px_40px_rgba(34,158,217,0.6)] hover:-translate-y-0.5"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-1.97 9.289c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.932z"/>
            </svg>
            Наш Telegram-канал
          </a>
        </div>
      </section>

      <ProcessSection />
      <CategoriesSection />
      <FeaturesSection />
      <MarqueeStrip reversed />
      <WorksSection />
      <TestimonialsSection />
      <SeoContentHome11 />
      <ContactSection />
      <Footer />
      <FloatingButtons />
    </main>
  );
}
