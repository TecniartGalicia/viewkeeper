# Privacidad

ViewKeeper es software local. No recoge telemetría y no tiene cuenta. Las peticiones de red que hace por su cuenta se enumeran abajo; todo lo demás es tu propia vista previa cargándose.

## Con quién habla

- **Con la web que abres en el mosaico**: tu servidor de desarrollo (normalmente `http://localhost:<puerto>`) o una web publicada, a través de un proxy que solo escucha en `127.0.0.1`. Al abrir una web publicada, ViewKeeper hace antes una petición `GET` a su dirección para ver si redirige a su dominio principal (`ejemplo.com` → `https://www.ejemplo.com`), y así abrir ese.
- **Con las API que pongas en `viewkeeper.apiOrigins`**: en otros puertos de este equipo, o servidores `https://`. Antes de pasar una por el proxy, ViewKeeper le pregunta una vez si admite por CORS el origen de tu app (una petición `OPTIONS` con el `Origin` de tu app). Solo te ofrece pasar una API cuando la llamada de tu propia página a ella ha fallado, y solo si contesta con el origen exacto de tu app.
- **Con puertos de este equipo** al buscar tu servidor de desarrollo: un `GET /` a una lista corta de puertos habituales de desarrollo, más los que nombren los scripts de tu `package.json`. Al pulsar el botón de la barra de estado, también una petición al servidor de desarrollo del último mosaico del proyecto, para saber si sigue en marcha.

Nada va a ningún otro sitio.

## Qué lee y qué escribe

- Lee los nombres de los ficheros de tu espacio de trabajo (no su contenido) para listar rutas en la matriz, para ofrecerte rutas al cambiar la de una fila y, si enciendes **Seguir al editor**, para saber la ruta del fichero que abres. Lee `package.json` para encontrar el puerto de tu servidor.
- Escribe `.vscode/viewkeeper.json` cuando guardas un mosaico. Las rutas se guardan sin su consulta ni su ancla, porque pueden llevar un testigo o un dato personal y este fichero está pensado para el control de versiones.
- Recuerda el último mosaico de cada proyecto en el almacenamiento del propio VS Code (no en tu proyecto), también sin consultas ni anclas.
- Escribe los PNG donde tú elijas cuando capturas. Las capturas usan un perfil temporal del navegador que se borra al terminar.

## Qué ve el proxy

Todo lo que carga tu vista previa pasa por el proxy, en memoria: tiene que hacerlo, para añadir el script de sincronización y arreglar las cookies. Solo guarda las últimas cookies que mandó cada sesión, para que una captura abra la página con la sesión iniciada, y olvida cada una cuando tu servidor la caduca. Nada de esto se escribe en disco ni se manda a ningún sitio.

Cuando una API de **otro servidor** pasa por el proxy, las llamadas salen de tu equipo con el origen de tu app. Esa API no recibe las cookies de tu app: el proxy guarda en memoria las que pone esa API, aparte para cada sesión del mosaico, y solo le manda esas y las cookies que tu app puso con un `Domain` que cubre a esa API (como haría un navegador). Para recordar cuáles son, el proxy deja en la vista previa una pequeña cookie de marca (`__vk_d_<nombre>`), que nunca llega a tu app.

## Lo que escribes en una vista, y los errores de tu página

Lo que escribes se reparte a las demás vistas dentro del panel, en memoria, para que enseñen lo mismo. El texto de los errores de JavaScript de tu página se enseña en el rótulo de esa vista. Ninguna de las dos cosas llega nunca al host de la extensión, ni al registro, ni al disco. El panel solo le manda a la extensión rutas, tamaños de página, cuentas de errores y avisos sin contenido (como el origen al que una página quiso irse).
