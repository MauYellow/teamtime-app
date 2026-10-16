// Confronto tra numeri di versione a tre parti (SPEC §15.4, 16/10/2026): "4.0.1" > "4.0" > "3.9.9".
// Si confronta parte per parte come numeri, non come testo né come numero decimale: "4.10" è maggiore di "4.9".

/** "4", "4.0", "4,0,1", " 4.0.1 " → [4, 0, 1]; null se non è un numero di versione. */
export function parseVersion(value: unknown): [number, number, number] | null {
  const text = String(value ?? '').trim().replace(/,/g, '.');
  if (!/^\d+(\.\d+){0,2}$/.test(text)) return null;
  const [major = 0, minor = 0, patch = 0] = text.split('.').map(Number);
  return [major, minor, patch];
}

/** Positivo se `a` è più recente di `b`, negativo se più vecchia, 0 se uguali. */
export function compareVersions(a: [number, number, number], b: [number, number, number]) {
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

/** True se la versione minima del foglio è più recente di quella installata (null = controllo saltato). */
export function isUpdateRequired(installed: string, required: unknown) {
  const mine = parseVersion(installed);
  const minimum = parseVersion(required);
  return !!mine && !!minimum && compareVersions(minimum, mine) > 0;
}
