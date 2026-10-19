import * as Location from 'expo-location';

export interface PlaceDetails {
  address: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  street: string;
  formattedAddress: string;
}

export const reverseGeocode = async (latitude: number, longitude: number): Promise<PlaceDetails | null> => {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results.length === 0) return null;

    const place = results[0];
    const parts = [place.street, place.city, place.region, place.country].filter(Boolean);
    const formattedAddress = parts.join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

    return {
      address: place.name || place.street || '',
      city: place.city || '',
      region: place.region || '',
      country: place.country || '',
      postalCode: place.postalCode || '',
      street: place.street || '',
      formattedAddress,
    };
  } catch (err) {
    console.error('Reverse geocode failed:', err);
    return null;
  }
};
