// Constantes de sesión sin dependencias de Node, seguras para importar desde
// el middleware (edge runtime).
export const SESSION_COOKIE = 'pulso_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 días
