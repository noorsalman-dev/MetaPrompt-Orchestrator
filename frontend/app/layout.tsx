import React from 'react';
import './globals.css';

export const metadata = {
  title: 'MetaPrompt Orchestrator',
  description: 'Autonomous meta-prompting engine',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-white m-0 p-0 overflow-hidden">{children}</body>
    </html>
  );
}