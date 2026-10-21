import { query } from '../db/pool.js';

export interface BannerRow {
  id: number;
  title: string;
  subtitle: string | null;
  image_path: string | null;
  link_url: string | null;
  position: number;
}

/**
 * Bannières ACTIVES triées par position.
 * SQL contractuel (api.md §3.4).
 */
export async function selectActiveBanners(): Promise<BannerRow[]> {
  const { rows } = await query<BannerRow>(
    `SELECT id, title, subtitle, image_path, link_url, position
       FROM banners
      WHERE active = TRUE
      ORDER BY position ASC`,
  );
  return rows;
}
