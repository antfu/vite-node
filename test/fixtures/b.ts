import { fileURLToPath } from 'url'

export const bPath = fileURLToPath(import.meta.url)

export const cValue = (await import('./c')).default
