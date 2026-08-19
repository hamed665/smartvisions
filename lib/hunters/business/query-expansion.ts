export type AreaExpansion = {
  city: string;
  areas?: string[];
};

export function expandBusinessQueries(industry: string, location: AreaExpansion) {
  const areas = location.areas?.filter(Boolean) ?? [];
  const locations = areas.length ? areas.map((area) => `${area}, ${location.city}`) : [location.city];
  const industryVariants = new Set([
    industry.trim(),
    industry.replace(/clinic/i, 'center').trim(),
    industry.replace(/restaurant/i, 'cafe').trim(),
  ]);

  return Array.from(industryVariants)
    .filter(Boolean)
    .flatMap((variant) => locations.map((place) => `${variant} in ${place}`));
}
