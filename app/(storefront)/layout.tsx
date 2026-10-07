import Link from "next/link";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <main className="flex-1">{children}</main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-4 px-6 py-6 text-xs text-neutral-500">
          <Link href="/tokutei-shoutorihiki">特定商取引法に基づく表示</Link>
          <Link href="/privacy">プライバシーポリシー</Link>
        </div>
      </footer>
    </div>
  );
}
