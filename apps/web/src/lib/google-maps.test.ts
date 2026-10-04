import { describe, expect, it } from 'vitest';
import { DEV_MAP_ID, mapSetup, scriptUrl } from './google-maps';

describe('Google Maps script URL', () => {
  it('loads the weekly API asynchronously with a callback, key escaped', () => {
    const u = new URL(scriptUrl('ab+c/d'));
    expect(u.origin + u.pathname).toBe(
      'https://maps.googleapis.com/maps/api/js',
    );
    expect(u.searchParams.get('key')).toBe('ab+c/d');
    expect(u.searchParams.get('v')).toBe('weekly');
    expect(u.searchParams.get('loading')).toBe('async');
    expect(u.searchParams.get('callback')).toBe('__cctvGoogleMapsReady');
    // No paid extras are requested up front.
    expect(u.searchParams.has('libraries')).toBe(false);
  });
});

describe('map setup', () => {
  it('uses Google Maps when key and Map ID are set', () => {
    expect(
      mapSetup({ googleApiKey: 'k', googleMapId: 'm', osmFallback: false }),
    ).toEqual({ engine: 'google', apiKey: 'k', mapId: 'm' });
    expect(
      mapSetup({
        googleApiKey: 'k',
        googleMapId: DEV_MAP_ID,
        osmFallback: true,
      }).engine,
    ).toBe('google');
  });

  it('production: never switches to OpenStreetMap, names what is missing', () => {
    expect(mapSetup({ osmFallback: false })).toEqual({
      engine: 'unconfigured',
      missing: [
        'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
        'NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID',
      ],
    });
    expect(mapSetup({ googleApiKey: 'k', osmFallback: false })).toEqual({
      engine: 'unconfigured',
      missing: ['NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID'],
    });
  });

  it('development: OpenStreetMap stands in when Google is not set up', () => {
    expect(mapSetup({ osmFallback: true })).toEqual({ engine: 'osm' });
  });
});
