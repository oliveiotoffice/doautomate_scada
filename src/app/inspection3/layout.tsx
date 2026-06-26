'use client';

import Header from '../inspection1/components/Header';
import { ThemeProvider, useTheme } from './components/ThemeContext';

function InnerLayout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  return (
    <div
      className="flex flex-col h-screen"
      style={{
        background: theme.bodyBg,
        color: theme.bodyText,
        transition: 'background 0.3s ease, color 0.3s ease',
      }}
    >
      {/* FIXED HEADER */}
      <div style={{ flexShrink: 0 }}>
        <Header name="Super Admin" role="admin" />
      </div>

      {/* CONTENT AREA — NO SCROLL HERE */}
      <main
        className="flex-1 overflow-hidden" // 🔥 critical change
        style={{
          display: "flex",
          minHeight: 0, // prevents flex overflow issues
        }}
      >
        {children}
      </main>
    </div>
  );
}

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <InnerLayout>{children}</InnerLayout>
    </ThemeProvider>
  );
}
