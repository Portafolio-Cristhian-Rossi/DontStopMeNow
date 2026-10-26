# App Android de DontStopMeNow

Se vincula con el servidor de tu compu, te deja elegir qué álbumes y listas bajar, los guarda en el celular
y los reproduce sin conexión con su propio reproductor (segundo plano, pantalla de bloqueo, auriculares,
cola, aleatorio y repetir).

## Compilar e instalar (EAS, en la nube)

Necesitás una cuenta gratis en [expo.dev](https://expo.dev). Desde tu compu, en la raíz del repo:

```bash
npm install
npm install -g eas-cli
eas login
cd apps/mobile
eas init                                   # la primera vez: crea el proyecto en tu cuenta
eas build -p android --profile preview     # compila el APK en la nube (tarda unos minutos)
```

Al terminar, EAS muestra un link y un código QR: abrilo desde el celular, descargá el APK e instalalo
(Android te va a pedir permitir "instalar apps de origen desconocido" para el navegador).

## Probar

1. En la compu: `npm start` en la raíz del repo y abrí http://localhost:4747/dispositivos.
2. El celular tiene que estar en el **mismo WiFi** que la compu.
3. Abrí la app y escaneá el código QR (o ingresá la dirección y el código a mano).
4. En **Descargas**, marcá álbumes o listas y tocá **Sincronizar**.
5. En **Biblioteca**, tocá una canción para escucharla (o los botones **Reproducir** / **Aleatorio** de un álbum
   o lista).

## Lista de verificación manual

- [ ] Vincular escaneando el QR.
- [ ] Vincular a mano (dirección + código).
- [ ] Marcar un álbum, sincronizar y verlo en Biblioteca.
- [ ] Desmarcarlo, sincronizar y ver que se borra (y que una canción que también está en una lista marcada
      se queda).
- [ ] Cortar el WiFi a mitad de una descarga y volver a sincronizar: termina bien.
- [ ] Mandar la app a segundo plano durante una descarga, volver y sincronizar: retoma.
- [ ] Revocar el celular desde la web (Dispositivos) y sincronizar: aparece el aviso de volver a vincular,
      sin borrar lo descargado.
- [ ] Cambiar la IP de la compu (reiniciar el router o cambiar de red) y sincronizar: la encuentra sola.
- [ ] Modo avión: la biblioteca descargada se sigue viendo.
- [ ] Suspender o apagar la compu a mitad de una sincronización: la app avisa que no encuentra el servidor (no
      se queda "Bajando…" para siempre).
- [ ] Dejar el celular sin tocar durante una sincronización larga: la pantalla no se apaga y sigue bajando.
- [ ] Desvincular y volver a vincular el mismo servidor: lo descargado se conserva.
- [ ] Con una biblioteca grande, la pantalla Descargas responde fluida al marcar y desmarcar.

### Reproductor

- [ ] Reproducir un álbum y apagar la pantalla: sigue sonando y pasa a la siguiente canción.
- [ ] Controles en la notificación y en la pantalla de bloqueo (play/pausa, anterior, siguiente), con la
      portada.
- [ ] Botón de auriculares Bluetooth (play/pausa, siguiente).
- [ ] Desconectar los auriculares: se pausa.
- [ ] Entra una llamada: se pausa y retoma al cortar.
- [ ] Aleatorio y repetir (no / todo / una) en la pantalla del reproductor.
- [ ] Mantener apretada una canción: "Reproducir a continuación" y "Agregar a la cola" aparecen en la cola.
- [ ] Cerrar la app (deslizarla de recientes) y volver: misma canción y mismo segundo, en pausa.
- [ ] Desmarcar el álbum que está sonando y sincronizar: la canción actual sigue sonando y se borra en la
      próxima sincronización; las demás salen de la cola.
- [ ] Modo avión: las portadas se siguen viendo.
- [ ] En Canciones, con miles de canciones descargadas, tocar una: empieza a sonar sin trabar la app, y el
      reproductor y la cola responden fluido.
- [ ] Terminar un álbum (sin repetir) y tocar play: vuelve a empezar desde la primera.
- [ ] La primera vez que reproducís, Android pide permiso de notificaciones: aceptalo para tener los
      controles.

## Desarrollo

```bash
npm test                               # incluye los tests de src/core
npm run typecheck -w @dsmn/mobile
npm run export:android -w @dsmn/mobile # empaqueta el JavaScript (comprueba que compila)
```

La lógica (`src/core`) es TypeScript puro y se prueba con Vitest; `src/native` adapta las APIs de Expo;
`app/` son las pantallas (expo-router).

### Ver los cambios en el celular (development build)

Expo Go no sirve: la app usa módulos nativos que no trae (por ejemplo `react-native-zeroconf`). En su lugar se
instala una vez un _development build_, que carga el JavaScript desde tu compu y se actualiza al guardar.

```bash
cd apps/mobile
npx eas-cli build -p android --profile development   # una vez, y de nuevo solo si cambia algo nativo
npx expo start --dev-client                          # el día a día: abrí "DontStopMeNow (dev)" en el celular
```

- Se instala como **DontStopMeNow (dev)** (paquete `com.cristhianrossi.dontstopmenow.dev`), al lado de la app de
  release, sin pisarla. Lo arma `app.config.ts` cuando `APP_VARIANT=development` (lo define `eas.json`).
- El celular tiene que estar en el mismo WiFi que la compu. Si la app dev no lista tu compu, escaneá el QR que
  muestra `expo start` o usá `npx expo start --dev-client --tunnel`.
- Los `console.log` y los errores salen en la terminal; con `j` se abren las React Native DevTools.
- Hay que volver a compilar cuando se agrega o saca una dependencia nativa o se cambian plugins o permisos en
  `app.json`. Pantallas, lógica y estilos se ven al instante.
