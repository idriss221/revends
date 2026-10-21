import { getOrSet } from '../cache/redis.js';
import { config } from '../config.js';
import { selectActiveBanners } from '../repositories/banners.repository.js';

/**
 * Bannières du carrousel d'accueil (GET /api/banners, D-ACC-1).
 * Lecture PostgreSQL unique + cache Redis partagé (TTL court, R8).
 */
export async function listBanners(): Promise<{ banners: Record<string, unknown>[] }> {
  return getOrSet('banners:public', config.redis.cacheTtlSeconds, async () => {
    const rows = await selectActiveBanners();
    return {
      banners: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        imagePath: r.image_path,
        linkUrl: r.link_url,
        position: r.position,
      })),
    };
  });
}
