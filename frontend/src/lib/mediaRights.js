// Autorizacion para subir imagenes: el servidor responde 409 `media_rights_required` la primera vez que un usuario sube
// una imagen. Este modulo conecta el interceptor de axios con el dialogo (sin importar `api`, para evitar ciclos).
const listeners = new Set();

export function onMediaRightsRequest(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Devuelve una promesa: true si el usuario acepta (y la declaracion quedo registrada), false si cancela.
export function requestMediaRights(detail) {
  return new Promise((resolve) => {
    if (!listeners.size) {
      resolve(false);
      return;
    }
    listeners.forEach((listener) => listener(detail, resolve));
  });
}

export const isMediaRightsError = (error) =>
  error?.response?.status === 409 && error?.response?.data?.detail?.code === 'media_rights_required';
