// Descarga un archivo recibido como blob (Excel, PDF) con el nombre que sugiere el servidor.
export function filenameFrom(response, fallback) {
  const header = response?.headers?.['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1] : fallback;
}

export function saveBlob(response, fallbackName) {
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFrom(response, fallbackName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
