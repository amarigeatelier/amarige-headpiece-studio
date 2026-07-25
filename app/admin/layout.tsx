import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <nav className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <div className="flex gap-6 text-sm font-medium text-neutral-700">
          <Link href="/admin/parts">パーツ</Link>
          <Link href="/admin/model-photos">モデル写真</Link>
          <Link href="/admin/settings">基本価格設定</Link>
          <Link href="/admin/orders">注文</Link>
          <Link href="/admin/leads">見込み客</Link>
        </div>
        <LogoutButton />
      </nav>
      {children}
    </div>
  );
}
