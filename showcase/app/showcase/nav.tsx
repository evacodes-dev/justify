"use client";

// Shared top nav across all showcase pages.
const LINKS: [string, string][] = [
  ["/showcase", "Feed"],
  ["/agents", "Agents"],
  ["/leaderboard", "Leaderboard"],
  ["/portfolio", "Portfolio"],
];

export function Nav({ active, right }: { active?: string; right?: React.ReactNode }) {
  return (
    <header className="hdr">
      <div className="brand">
        <a href="/showcase" className="brand-link"><span className="logo">J</span><span className="name">Justify</span></a>
        <nav className="nav">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className={active === href ? "nav-a active" : "nav-a"}>{label}</a>
          ))}
        </nav>
      </div>
      {right && <div className="hdr-right">{right}</div>}
    </header>
  );
}
