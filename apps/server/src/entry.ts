import { installWarningFilter } from './runtime.ts';

// Punto de entrada del build empaquetado. El filtro de avisos va antes de cargar el resto
// (node:sqlite emite su aviso experimental al cargarse).
installWarningFilter();
void import('./main.ts').then((m) => m.main());
