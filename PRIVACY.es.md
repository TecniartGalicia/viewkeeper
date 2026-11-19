# Privacidad

ViewKeeper es software local. No recoge telemetría, no tiene cuenta y no hace ninguna petición de red propia.

## Con quién habla

- **Con tu servidor de desarrollo**, en la dirección que elijas (normalmente `http://localhost:<puerto>`), a través de un proxy que solo escucha en `127.0.0.1`.
- **Con las API en otros puertos locales** que pongas en `viewkeeper.apiOrigins`. Antes de pasar una por el proxy, ViewKeeper le pregunta una vez si admite por CORS el origen de tu app (una petición `OPTIONS` con el `Origin` de tu app). Una dirección que no sea este equipo no se contacta nunca.
- **Con puertos de este equipo** al buscar tu servidor de desarrollo: un `GET /` a una lista corta de puertos habituales de desarrollo, más los que nombren los scripts de tu `package.json`.

Nada va a ningún otro sitio.

## Qué lee y qué escribe

- Lee los nombres de los ficheros de tu espacio de trabajo (no su contenido) para listar rutas en la matriz, y `package.json` para encontrar el puerto de tu servidor.
- Escribe `.vscode/viewkeeper.json` cuando guardas un mosaico. Las rutas se guardan sin su consulta ni su ancla, porque pueden llevar un testigo o un dato personal y este fichero está pensado para el control de versiones.
- Escribe los PNG donde tú elijas cuando capturas. Las capturas usan un perfil temporal del navegador que se borra al terminar.

## Qué ve el proxy

Todo lo que carga tu vista previa pasa por el proxy, en memoria: tiene que hacerlo, para añadir el script de sincronización y arreglar las cookies. Solo guarda las últimas cookies que mandó cada sesión, para que una captura abra la página con la sesión iniciada, y olvida cada una cuando tu servidor la caduca. Nada de esto se escribe en disco ni se manda a ningún sitio.

## Lo que escribes en una vista

Se reparte a las demás vistas dentro del panel, en memoria, para que enseñen lo mismo. Nunca llega al host de la extensión, ni al registro, ni al disco. El panel solo le manda a la extensión rutas, tamaños de página y avisos sin contenido.
