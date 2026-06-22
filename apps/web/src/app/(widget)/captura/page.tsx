import { PersonalWidget } from '@/components/personal/personal-widget';

/** Widget personal flotante (atelier). Lo carga la ventana siempre-encima del
 *  shell de escritorio; también se puede ver en el navegador. */
export default function CapturaPage() {
  return (
    <main className="flex min-h-screen items-start justify-center p-3">
      <PersonalWidget />
    </main>
  );
}
