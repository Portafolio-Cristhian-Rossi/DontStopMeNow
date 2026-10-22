/** Texto para comparar en búsquedas: sin tildes y en minúsculas. */
export function searchKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
