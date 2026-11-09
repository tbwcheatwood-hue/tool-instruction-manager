import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "T.I.M.",
  description: "Tool & Instruction Manager — a task iteration mechanism",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black font-sans text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
