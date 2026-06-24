// Tipos compartidos por server actions y sus formularios cliente.
// (Los archivos "use server" solo pueden exportar funciones async, por eso
// los tipos viven acá.)

export interface LoginState {
  error?: string;
}

export interface RegisterState {
  error?: string;
}

export interface FormState {
  status?: 'success' | 'error';
  message?: string;
}

export interface AssignState {
  status?: 'assigned' | 'overload_warning' | 'error';
  message?: string;
  signals?: { code: string; message: string }[];
}
