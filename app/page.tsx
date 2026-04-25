import Navbar from "@/components/landing/Navbar";
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

export default function Home() {
  return (
    <main className="bg-[#0A0F1E] min-h-screen">
      <Navbar />
      <HeroSection />
      <MarqueeStrip />
      <AboutSection />
      <ProcessSection />
      <CategoriesSection />
      <FeaturesSection />
      <MarqueeStrip reversed />
      <WorksSection />
      <TestimonialsSection />
      <ContactSection />
      <Footer />
    </main>
  );
}
