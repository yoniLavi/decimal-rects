import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fill the Unit — learn decimals",
  description:
    "A unit bar split into tenths, hundredths, thousandths… Fill pieces and watch the decimal grow.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
