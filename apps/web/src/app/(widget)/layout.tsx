import type { ReactNode } from 'react';
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import { PersonalProvider } from '@/lib/personal/store';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

/** Capa del widget flotante: tema cálido SIN fondo opaco (transparente), para que
 *  la ventana frameless del shell muestre solo el panel. Comparte el store local. */
export default function WidgetLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${display.variable} ${body.variable} ${mono.variable} theme-personal-bare min-h-screen`}>
      <PersonalProvider>{children}</PersonalProvider>
    </div>
  );
}
