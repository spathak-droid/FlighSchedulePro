/**
 * Aircraft image URLs mapped by registration.
 * Real photos from Wikimedia Commons (CC-licensed), stored in /public/aircraft/.
 */

const AIRCRAFT_IMAGES: Record<string, string> = {
  'N172SP': '/aircraft/cessna-172.jpg',
  'N152AB': '/aircraft/cessna-152.jpg',
  'N182RG': '/aircraft/cessna-182.jpg',
  'SIM-01': '/aircraft/simulator.jpg',
};

export function getAircraftImage(registration: string): string {
  return AIRCRAFT_IMAGES[registration] ?? '/aircraft/default.svg';
}
