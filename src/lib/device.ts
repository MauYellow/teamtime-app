import { Platform } from 'react-native';

/** Valore del campo Device su Airtable, come lo scriveva Thunkable (il portale scrive "Computer"). */
export const DEVICE = Platform.OS === 'ios' ? 'Apple' : 'Android';
