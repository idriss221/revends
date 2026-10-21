/**
 * k6 — tests de charge (Phase 10).
 *
 * ⚠️ NON VÉRIFIÉ : `k6` n'est pas installé dans cet environnement. Ce script
 * est réécrit pour être syntaxiquement correct et conforme à l'API k6, mais il
 * n'a PAS été exécuté — à valider avant toute conclusion de performance.
 *
 * Usage :
 *   k6 run k6/test-load.js
 *   BASE_URL=https://api.example.com k6 run k6/test-load.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4001';

// Métriques personnalisées
export const reqDuration = new Trend('req_duration', true);
export const reqFailed = new Rate('req_failed');

export const options = {
  scenarios: {
    // Scénario 1 — pic de charge : 100 utilisateurs simultanés pendant 10 min.
    pic_de_charge: {
      executor: 'constant-vus',
      vus: 100,
      duration: '10m',
      exec: 'buyerJourney',
    },
    // Scénario 2 — charge soutenue : 50 utilisateurs simultanés pendant 30 min.
    charge_soutenue: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30m',
      exec: 'browseJourney',
    },
    // Scénario 3 — point de rupture : montée progressive 10 → 200 VUs.
    rupture: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '5m', target: 50 },
        { duration: '10m', target: 200 },
        { duration: '5m', target: 0 },
      ],
      exec: 'randomCatalog',
    },
  },
  thresholds: {
    req_failed: ['rate<0.05'],
    req_duration: ['p(95)<500'],
  },
};

/** Enregistre durée + échec pour chaque réponse. */
function track(res) {
  reqDuration.add(res.timings.duration);
  reqFailed.add(res.status >= 400 || res.status === 0);
}

function get(path, params) {
  const res = http.get(`${BASE_URL}${path}`, params);
  track(res);
  return res;
}

/** Parcours acheteur (authentifié ou catalogue). */
export function buyerJourney() {
  const banners = get('/api/banners');
  check(banners, { 'banners 200': (r) => r.status === 200 });
  sleep(1);

  const locations = get('/api/products/locations');
  check(locations, { 'locations 200': (r) => r.status === 200 });
  sleep(1);
}

/** Parcours navigation (accueil → catégories). */
export function browseJourney() {
  const products = get('/api/products?page=1&per_page=12');
  check(products, { 'products 200': (r) => r.status === 200 });
  sleep(1);

  const categories = get('/api/categories');
  check(categories, { 'categories 200': (r) => r.status === 200 });
  sleep(1);
}

/** Catalogue sur des pages aléatoires (montée en charge). */
export function randomCatalog() {
  const page = 1 + Math.floor(Math.random() * 10);
  const res = get(`/api/products?page=${page}&per_page=12`);
  check(res, { 'catalogue 200': (r) => r.status === 200 });
  sleep(1);
}

/** Fonction par défaut (utilisée si un scénario n'a pas d'`exec`). */
export default function () {
  browseJourney();
}
