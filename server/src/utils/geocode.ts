export async function geocodeAddress(city: string, address: string): Promise<{ latitude: number; longitude: number } | null> {
  if (!city?.trim() || !address?.trim()) return null;

  const query = encodeURIComponent(`${address}, ${city}, Srbija`);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { 'User-Agent': 'ZavrsiMi/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json() as { lat: string; lon: string }[];
    if (!data.length) return null;
    return {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
    };
  } catch {
    return null;
  }
}
