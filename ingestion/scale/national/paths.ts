import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('.', import.meta.url)));
export const NATIONAL_CACHE_DIR = resolve(HERE, '../../.national-cache');
export const NATIONAL_CACHE_FILE = resolve(NATIONAL_CACHE_DIR, 'nhle-national-cache.json');
