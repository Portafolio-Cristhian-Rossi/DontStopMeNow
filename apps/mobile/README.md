# App Android de DontStopMeNow

Se vincula con el servidor de tu compu, te deja elegir qué álbumes y listas bajar y los guarda en el
celular para escucharlos sin conexión. (El reproductor llega en la próxima etapa.)

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

## Desarrollo

```bash
npm test                               # incluye los tests de src/core
npm run typecheck -w @dsmn/mobile
npm run export:android -w @dsmn/mobile # empaqueta el JavaScript (comprueba que compila)
```

La lógica (`src/core`) es TypeScript puro y se prueba con Vitest; `src/native` adapta las APIs de Expo;
`app/` son las pantallas (expo-router).
