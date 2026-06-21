import { getAuthContext } from '@/lib/auth/context';
import { getWidgetFocus } from '@/server/queries';
import { PulsoWidget } from '@/components/pulso-widget';
import { WidgetSignedOut } from '@/components/widget-signed-out';

/**
 * Ruta standalone del widget de Pulso (ventana flotante del shell de escritorio).
 * No usa requireAuth: si no hay sesión muestra un cartel compacto en vez de
 * redirigir al /login completo, para que la ventana flotante nunca muestre la app.
 */
export default async function WidgetPage() {
  const ctx = await getAuthContext();

  return (
    <main className="flex min-h-screen items-start justify-center p-2">
      {ctx ? <PulsoWidget focus={await getWidgetFocus(ctx)} /> : <WidgetSignedOut />}
    </main>
  );
}
