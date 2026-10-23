import { exitWithError, installWarningFilter } from './runtime.ts';

// Punto de entrada del build empaquetado. El filtro de avisos va antes de cargar el resto
// (node:sqlite emite su aviso experimental al cargarse).
installWarningFilter();
import('./main.ts')
  .then((m) => m.main())
  // Lo que falle antes de escuchar (base de datos dañada, carpeta de datos sin permisos…) sin traza.
  .catch((err: unknown) =>
    exitWithError(`No se pudo iniciar el servidor: ${err instanceof Error ? err.message : String(err)}`),
  );
