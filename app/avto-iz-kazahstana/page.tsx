import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/landing/Navbar";
import ContactSection from "@/components/landing/ContactSection";
import Footer from "@/components/landing/Footer";
import FloatingButtons from "@/components/landing/FloatingButtons";
import SeoContentHome6 from "@/components/landing/SeoContentHome6";
import CatalogContent from "@/app/catalog/CatalogContent";

export const metadata: Metadata = {
  title: "Купить и пригнать машину из Казахстана в Россию под ключ от IM-Auto",
  description: "Подберите автомобиль в Казахстане по бюджету и требованиям. Согласуйте проверку, состав расходов, порядок выкупа, доставки и оформления в России. Изучите этапы заказа, критерии выбора и запросите индивидуальный расчет.",
};

export default function AvtoIzKazahstanaPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <SeoContentHome6 />
      <Suspense fallback={<div className="min-h-[400px]" />}>
        <CatalogContent defaultCountry="all" embedded />
      </Suspense>
      <ContactSection />
      <Footer />
      <FloatingButtons />
    </main>
  );
}
