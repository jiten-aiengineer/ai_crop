import { NextResponse } from 'next/server';

export const runtime = 'edge';

type GeocodingResponse = {
  results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }>;
};

type ForecastResponse = {
  timezone?: string;
  current?: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    precipitation: number;
    rain: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
  };
  hourly?: {
    time: string[];
    precipitation_probability: number[];
    precipitation: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
  };
};

function finite(value: string | null) {
  if (value === null || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function weatherLabel(code = 0) {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Hail or snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Heavy showers';
  return 'Thunderstorm';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let latitude = finite(url.searchParams.get('lat'));
  let longitude = finite(url.searchParams.get('lon'));
  let resolvedLocation = '';

  if (latitude === null || longitude === null) {
    const location = String(url.searchParams.get('location') || '').trim().slice(0, 120);
    if (!location) return NextResponse.json({ error: 'Enter a village, district or city, or use your current location.' }, { status: 400 });
    const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geocodeUrl.searchParams.set('name', location);
    geocodeUrl.searchParams.set('count', '1');
    geocodeUrl.searchParams.set('language', 'en');
    geocodeUrl.searchParams.set('format', 'json');
    let geocodeResponse: Response;
    try { geocodeResponse = await fetch(geocodeUrl, { signal: AbortSignal.timeout(8_000) }); }
    catch { return NextResponse.json({ error: 'Location lookup took too long. Please try again.' }, { status: 504 }); }
    if (!geocodeResponse.ok) return NextResponse.json({ error: 'Location lookup is unavailable. Please try again.' }, { status: 502 });
    const geocode = await geocodeResponse.json() as GeocodingResponse;
    const place = geocode.results?.[0];
    if (!place) return NextResponse.json({ error: 'Location not found. Try adding your district or state.' }, { status: 404 });
    latitude = place.latitude;
    longitude = place.longitude;
    resolvedLocation = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
  }

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: 'The supplied location is invalid.' }, { status: 400 });
  }

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', String(latitude));
  forecastUrl.searchParams.set('longitude', String(longitude));
  forecastUrl.searchParams.set('current', 'temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m');
  forecastUrl.searchParams.set('hourly', 'precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,temperature_2m,relative_humidity_2m');
  forecastUrl.searchParams.set('forecast_hours', '12');
  forecastUrl.searchParams.set('timezone', 'auto');

  let response: Response;
  try { response = await fetch(forecastUrl, { signal: AbortSignal.timeout(10_000) }); }
  catch { return NextResponse.json({ error: 'Weather service took too long. Please try again.' }, { status: 504 }); }
  if (!response.ok) return NextResponse.json({ error: 'Weather information is temporarily unavailable.' }, { status: 502 });
  const forecast = await response.json() as ForecastResponse;
  if (!forecast.current || !forecast.hourly) return NextResponse.json({ error: 'Weather information is incomplete.' }, { status: 502 });

  const nextSix = {
    rainChance: Math.max(...forecast.hourly.precipitation_probability.slice(0, 6), 0),
    rainMm: forecast.hourly.precipitation.slice(0, 6).reduce((sum, value) => sum + (value || 0), 0),
    maxWind: Math.max(...forecast.hourly.wind_speed_10m.slice(0, 6), 0),
    maxGust: Math.max(...forecast.hourly.wind_gusts_10m.slice(0, 6), 0),
  };

  return NextResponse.json({
    location: resolvedLocation || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`,
    latitude,
    longitude,
    timezone: forecast.timezone,
    current: { ...forecast.current, label: weatherLabel(forecast.current.weather_code) },
    nextSix,
    source: 'Open-Meteo',
  });
}
