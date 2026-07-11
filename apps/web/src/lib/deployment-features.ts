/** Flags server-only. En producción, las superficies sensibles nacen cerradas. */
function enabled(name: 'PULSO_PUBLIC_REGISTRATION_ENABLED' | 'PULSO_PERSONAL_API_ENABLED'): boolean {
  const value = process.env[name];
  if (value === 'true') return true;
  if (value === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

export function isPublicRegistrationEnabled(): boolean {
  return enabled('PULSO_PUBLIC_REGISTRATION_ENABLED');
}

export function isPersonalApiEnabled(): boolean {
  return enabled('PULSO_PERSONAL_API_ENABLED');
}
