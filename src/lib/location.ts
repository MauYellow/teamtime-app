import * as Location from 'expo-location';

import { api } from '@/lib/api';
import { log } from '@/lib/log';

// Posizione GPS per i locali con GPS = "yes". [miglioria] La posizione si legge al momento della
// timbratura (l'originale la leggeva solo nella Splash). L'indirizzo arriva da geocode.maps.co tramite il proxy.

/** Chiede il permesso (Splash). Restituisce true se concesso. */
export async function requestLocationPermission() {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    log(granted ? 'GPS: permesso concesso' : 'GPS: permesso negato');
    return granted;
  } catch (error) {
    log(`GPS: errore permesso ${String(error)}`);
    return false;
  }
}

/** Indirizzo dalle coordinate, nel formato salvato oggi su Airtable (display_name). */
async function reverseGeocode(latitude: number, longitude: number) {
  try {
    // Tramite il proxy (la chiave di geocode.maps.co resta sul server, SPEC §18).
    const { address } = await api<{ address: string }>('/geocode', { lat: latitude, lon: longitude });
    return address;
  } catch (error) {
    // Se l'indirizzo non arriva si salvano almeno le coordinate.
    log(`Geocode: ${String(error)}`);
    return `${latitude}, ${longitude}`;
  }
}

/**
 * Indirizzo attuale, oppure null se il GPS non è disponibile (permesso negato, servizi spenti, timeout).
 * Chi chiama decide il testo da salvare al posto dell'indirizzo (diverso per entrata e uscita).
 */
export async function getCurrentAddress(): Promise<string | null> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    if (!granted) return null;
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
    ]);
    if (!position) {
      log('GPS: timeout');
      return null;
    }
    return await reverseGeocode(position.coords.latitude, position.coords.longitude);
  } catch (error) {
    log(`GPS: ${String(error)}`);
    return null;
  }
}
