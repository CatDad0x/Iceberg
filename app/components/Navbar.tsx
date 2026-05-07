"use client";

import Link from "next/link";

export default function Navbar() {
  return (
    <div className="mb-8 flex items-center justify-between">
      <Link href="/" className="text-lg font-bold text-white tracking-tight">
        YF Risk Tool
      </Link>
    </div>
  );
}
