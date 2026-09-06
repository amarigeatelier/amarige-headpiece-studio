import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "amarige ヘッドパーツ",
  description: "amarige のヘッドパーツを選んで、着けたイメージを見ながら購入できます。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* トップページの見出し用(Shippori Mincho)。next/font/googleは日本語書体だと
            latinサブセットしか持ってこられずかな・漢字が欠けるため、直接リンクで読み込む。 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;600&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
