/** All user context currently used by research must participate in result reuse. */
export function researchRequestKey({ name, aliases = [], foodContext = null } = {}) {
  return JSON.stringify([
    'consumer-health-r6-quality',
    String(name || '').trim().toLowerCase(),
    Array.isArray(aliases) ? aliases.map((a) => String(a).trim()) : [],
    String(foodContext?.category || '').trim(),
    String(foodContext?.productName || '').trim(),
    String(foodContext?.ingredientsText || '').trim(),
    foodContext?.nutrition || null,
  ]);
}
