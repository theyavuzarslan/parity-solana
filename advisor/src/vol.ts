import data from './vol.json';
import type { VolEntry } from './advisor';
export const VOL: Record<string, VolEntry> = (data as { vol: Record<string, VolEntry> }).vol;
