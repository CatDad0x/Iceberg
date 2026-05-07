import Link from "next/link";

const variants = [
  {
    href: "/mock/clinical",
    title: "Clinical",
    blurb: "Minimal personality. Penguin appears once in the header. Body of the report is institutional. Closest to current style. refined.",
  },
  {
    href: "/mock/friendly",
    title: "Friendly",
    blurb: "Penguin in header + verdict next to risk score. Plain-English risk pills (\"Looks clean\" / \"I wouldn't\"). Best balance.",
  },
  {
    href: "/mock/personal",
    title: "Personal",
    blurb: "Cat Dad voice throughout. Penguin loading messages, signed footer, more brand expression. Highest personality dial.",
  },
  {
    href: "/mock/iceberg",
    title: "Iceberg (Friendly + Iceberg theme)",
    blurb: "Friendly base plus: severity legend, Position Map (protocol flow), iceberg score viz, Above/Below the waterline framing, official protocol docs links. The recommended next step.",
  },
];

export default function MockIndex() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-900">Iceberg. Design Mocks</h1>
        <p className="mt-2 text-sm text-slate-600">
          Three variants of the same redesign. Same name, layout, and data. different personality dial.
          Pick one and I&apos;ll wire it into the real app.
        </p>
        <div className="mt-6 space-y-3">
          {variants.map((v) => (
            <Link
              key={v.href}
              href={v.href}
              className="block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
            >
              <div className="text-base font-semibold text-slate-900">{v.title}</div>
              <div className="mt-1 text-sm text-slate-600">{v.blurb}</div>
              <div className="mt-2 text-xs text-blue-600">{v.href} →</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
