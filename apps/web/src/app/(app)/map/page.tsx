import { connection } from 'next/server';
import { mapsConfigFromEnv } from '@/lib/maps-config';
import { OverviewMapView } from './overview-map-view';

export default async function OverviewMapPage() {
  // Render per request: the settings come from the runtime environment.
  await connection();
  return <OverviewMapView maps={mapsConfigFromEnv()} />;
}
