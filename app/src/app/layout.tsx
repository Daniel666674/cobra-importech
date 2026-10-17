import type { Metadata, Viewport } from "next";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Importech",
  description: "Inventario, ventas y garantías para tiendas Apple",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/favicon-32.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#1f2937", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" className="h-full antialiased">
      <body className="min-h-full">{children}<SwRegister /></body>
    </html>
  );
}
