# Política de media de fondo del portal

`portal_background_url` se devuelve deliberadamente desde
`GET /api/public/{organization_id}/organization`: el navegador de un visitante
necesita conocer esa URL para pintar el fondo del portal. No es un secreto ni
un identificador de cliente; solo puede apuntar al recurso gestionado bajo
`/api/media/portal-backgrounds/{organization_id}/{filename}`.

El endpoint de escritura exige un usuario con rol de gestión y resuelve la
organización autorizada antes de guardar. Los nombres de archivo son aleatorios,
la ruta valida tanto organización como nombre, y la lectura pública solo sirve
WebP, MP4 o WebM con `nosniff` y caché inmutable.

No se deben guardar URLs arbitrarias mediante la actualización general de
organización. La aplicación debe obtener la URL exclusivamente de la respuesta
del endpoint de subida autenticado. Si un futuro requisito necesita fondos
privados, deberá usar una URL firmada y no el campo público actual.
