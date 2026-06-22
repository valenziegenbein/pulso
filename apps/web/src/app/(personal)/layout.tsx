import type { ReactNode } from 'react';
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import { PersonalProvider } from '@/lib/personal/store';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

/** Capa raíz del modo Personal: tema cálido "atelier", fuentes y estado local. */
export default function PersonalRootLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${display.variable} ${body.variable} ${mono.variable} theme-personal relative min-h-screen overflow-x-hidden`}
    >
      <div className="atelier-glow" aria-hidden />
      <div className="atelier-grain" aria-hidden />
      <div className="relative z-10">
        <PersonalProvider>{children}</PersonalProvider>
      </div>
    </div>
  );
}
