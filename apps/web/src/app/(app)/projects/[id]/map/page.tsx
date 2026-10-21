import { connection } from 'next/server';
import { mapsConfigFromEnv } from '@/lib/maps-config';
import { SurveyMapView } from './survey-map-view';

export default async function SurveyMapPage() {
  // Render per request: the settings come from the runtime environment.
  await connection();
  return <SurveyMapView maps={mapsConfigFromEnv()} />;
}
