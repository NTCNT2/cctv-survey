import { connection } from 'next/server';
import {
  DEV_MAP_ID,
  KEY_ENV,
  MAP_ID_ENV,
  type MapsConfig,
} from '@/lib/google-maps';
import { SurveyMapView } from './survey-map-view';

/**
 * Reads an environment variable at request time. A dynamic name is never
 * inlined by `next build`, so the key / Map ID can change in the container
 * environment without rebuilding the image.
 */
function runtimeEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export default async function SurveyMapPage() {
  // Render per request: the settings come from the runtime environment.
  await connection();
  // `next dev`, or a test server that opts in: OpenStreetMap may stand in and
  // Google's DEMO_MAP_ID is allowed. Production: Google Maps or a clear error.
  const dev =
    process.env.NODE_ENV !== 'production' ||
    runtimeEnv('SURVEY_MAP_DEV_FALLBACK') === 'true';
  const maps: MapsConfig = {
    googleApiKey: runtimeEnv(KEY_ENV),
    googleMapId: runtimeEnv(MAP_ID_ENV) ?? (dev ? DEV_MAP_ID : undefined),
    osmFallback: dev,
  };
  return <SurveyMapView maps={maps} />;
}
