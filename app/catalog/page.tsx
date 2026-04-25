import { Suspense } from "react";
import CatalogContent from "./CatalogContent";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata = {
  title: "Каталог автомобилей — IM-Auto",
  description: "Автомобили из Кореи, Японии и Китая. Эконом, комфорт, бизнес и премиум класс. Доставка под ключ.",
};

export default function CatalogPage() {
  return (
    <main className="bg-[#0A0F1E] min-h-screen">
      <Navbar />
      <Suspense fallback={<div className="min-h-screen" />}>
        <CatalogContent />
      </Suspense>
      <Footer />
    </main>
  );
}
