import "./styles.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Smart Visions Growth OS",
  description: "AI-assisted sales and growth operating system",
};

const nav = [
  ["Dashboard", "/"],
  ["Hunters", "/hunters"],
  ["Leads", "#"],
  ["Intent Leads", "#"],
  ["Campaigns", "#"],
  ["Conversations", "#"],
  ["Hot Leads", "#"],
  ["Services", "#"],
  ["Pricing", "#"],
  ["Portfolio", "#"],
  ["Preview Studio", "#"],
  ["Markets", "#"],
  ["AI Agents", "#"],
  ["Outreach", "#"],
  ["Reports", "#"],
  ["System", "#"],
] as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">Smart Visions</div>
            <div className="badge">Growth OS</div>
            <nav>{nav.map(([item, href]) => <a href={href} key={item}>{item}</a>)}</nav>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
