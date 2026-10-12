import "./styles.css";
import "./control-center-v1.css";
import "./live-conversation.css";
import { Suspense, type ReactNode } from "react";
import { AppShell } from "./app-shell";

export const metadata = {
  title: "Smart Visions Growth OS",
  description: "AI-assisted sales and growth operating system",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={children}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
