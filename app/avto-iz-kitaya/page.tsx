import type { Metadata } from "next";
import { Suspense } from "react";
import Navbar from "@/components/landing/Navbar";
import ContactSection from "@/components/landing/ContactSection";
import Footer from "@/components/landing/Footer";
import FloatingButtons from "@/components/landing/FloatingButtons";
import SeoContentHome8 from "@/components/landing/SeoContentHome8";
import CatalogContent from "@/app/catalog/CatalogContent";

export const metadata: Metadata = {
  title: "Купить авто из Китая под заказ и привезти в Россию под ключ по доступной цене от IM-Auto",
  description: "Подберем автомобиль в Китае по бюджету и требованиям, проверим выбранный вариант, согласуем полный расчет и организуем выкуп, доставку, таможенное оформление и передачу в России. Изучите порядок заказа и запросите консультацию.",
};

export default function AvtoIzKitayaPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <SeoContentHome8 />
      <Suspense fallback={<div className="min-h-[400px]" />}>
        <CatalogContent defaultCountry="china" embedded />
      </Suspense>
      <ContactSection />
      <Footer />
      <FloatingButtons />
    </main>
  );
}
