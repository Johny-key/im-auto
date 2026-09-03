import { notFound } from "next/navigation";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import FloatingButtons from "@/components/landing/FloatingButtons";
import CarDetailClient from "./CarDetailClient";
import { translateBrand, translateModel } from "@/app/catalog/translate";

const PARSER_URL = process.env.PARSER_API_URL ?? "http://localhost:8000";
const PARSER_KEY = process.env.PARSER_API_KEY ?? "";

async function getCar(id: string) {
  try {
    const res = await fetch(`${PARSER_URL}/cars/${id}`, {
      headers: PARSER_KEY ? { "X-Api-Key": PARSER_KEY } : {},
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const car = await getCar(id);
  if (!car) return { title: "Автомобиль не найден — IM-AUTO" };
  const brand = translateBrand(car.manufacturer ?? "");
  const model = translateModel([car.model, car.badge].filter(Boolean).join(" "));
  const year = car.year ? ` ${car.year}` : "";
  const origin = car?.country === "china" ? "из Китая" : "из Кореи";
  return {
    title: `${brand} ${model}${year} — IM-AUTO`,
    description: `${brand} ${model}${year} ${origin}. Доставка под ключ в РФ. Расчёт стоимости включает растаможку и утильсбор.`,
  };
}

export default async function CarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const car = await getCar(id);
  if (!car) notFound();

  return (
    <main className="bg-[#F5F7FC] min-h-screen">
      <Navbar />
      <CarDetailClient car={car} />
      <Footer />
      <FloatingButtons />
    </main>
  );
}
