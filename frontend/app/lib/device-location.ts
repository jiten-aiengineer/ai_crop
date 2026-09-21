export type DevicePlace = {
  latitude: number;
  longitude: number;
  accuracy: number;
  village: string;
  city: string;
  district: string;
  state: string;
  postcode: string;
  country: string;
  label: string;
  metadata: Record<string, unknown>;
};

type ReverseGeocode = {
  locality?: string;
  city?: string;
  principalSubdivision?: string;
  postcode?: string;
  countryName?: string;
  localityInfo?: {
    administrative?: Array<{ name?: string; description?: string; adminLevel?: number }>;
  };
};

function unique(values: Array<string | undefined>) {
  return values.map((value) => (value || '').trim()).filter((value, index, items) => value && items.indexOf(value) === index);
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not supported on this device.'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 60_000,
    });
  });
}

export async function reverseGeocode(latitude: number, longitude: number, language = 'en'): Promise<Omit<DevicePlace, 'accuracy'>> {
  const endpoint = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
  endpoint.searchParams.set('latitude', String(latitude));
  endpoint.searchParams.set('longitude', String(longitude));
  endpoint.searchParams.set('localityLanguage', language);
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('We found your location, but could not identify the place name. Please try again.');
  const data = await response.json() as ReverseGeocode;
  const administrative = data.localityInfo?.administrative || [];
  const district = administrative.find((item) => /district/i.test(item.description || ''))?.name
    || administrative.find((item) => item.adminLevel === 5)?.name
    || data.city || data.locality || '';
  const city = data.city || data.locality || district;
  const village = data.locality && data.locality !== city ? data.locality : '';
  const state = data.principalSubdivision || administrative.find((item) => item.adminLevel === 4)?.name || '';
  const label = unique([village || city, district, state]).join(', ');
  if (!district || !state || !label) throw new Error('We could not identify your district and state. Move to an open area and try again.');
  return {
    latitude,
    longitude,
    village,
    city,
    district,
    state,
    postcode: data.postcode || '',
    country: data.countryName || 'India',
    label,
    metadata: { administrative },
  };
}

export async function locateDevice(language = 'en'): Promise<DevicePlace> {
  const position = await getPosition();
  const place = await reverseGeocode(position.coords.latitude, position.coords.longitude, language);
  return { ...place, accuracy: Math.round(position.coords.accuracy || 0) };
}
