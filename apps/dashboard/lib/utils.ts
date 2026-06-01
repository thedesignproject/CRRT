import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Turn a display name into a candidate project key. Mirrors the server's
 * `slugifyProjectKey` so the suggested key matches what the API will accept.
 */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Client mirror of the server's `isValidProjectKey`: 1–63 chars, lowercase
 * alphanumerics, single internal hyphens. */
export function isValidProjectKey(key: string): boolean {
  return key.length >= 1 && key.length <= 63 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)
}
