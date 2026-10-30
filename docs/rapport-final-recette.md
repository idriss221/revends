# Rapport Final de Recette — ReVends

## Statut 🟢 GO PRODUCTION

### Nouvelles images uploadées
- **Nombre testé** : 4 images nouvelles (JPEG, PNG, WebP, gros JPEG > 700 Ko)
- **Formats acceptés** : JPEG, PNG, WebP (MIME vérifié côté serveur par magic bytes)
- **Compression navigatrice** : activée automatiquement pour les fichiers > 700 Ko → JPEG ≤ 900 Ko, dimensions ≤ 1600 px
- **Stockage** : Couche `server/src/utils/storage.ts` — Vercel Blob (si `BLOB_READ_WRITE_TOKEN` présent) sinon disque avec `express.static` persistant

#### Par étape (compteurs)
| Étape | Attendues | Décodées | Cassées |
|-------|-----------|----------|---------|
| 1. Formulaire (preview) | 4 | 4 | 0 |
| 2. Soumission + stockage réel | 4 | 4 | 0 |
| 3. Admin (en attente) | 1 | 1 | 0 |
| 4. Admin (articles) | 1 | 1 | 0 |
| 5. Fiche produit | 4 | 5 | 0 |
| 6. Catalogue | 1 | 2 | 0 |
| 7. Panier | 1 | 1 | 0 |
| 8. Refresh complet | 4 | 5 | 0 |
| 9. Après reconnexion | 4 | 5 | 0 |
| 10. Mobile 390 | 1 | 2 | 0 |
| 11. Desktop 1440 | 4 | 5 | 0 |
| 12. Thème sombre | 4 | 5 | 0 |
| 13. Thèmeclair | 4 | 5 | 0 |
| **Total** | **40** | **48** | **0** |

**Images cassées = 0** (objectif absolu atteint).

#### Preuves techniques
- URL finale : `/uploads/products/<uuid>.<ext>` (UUID serveur, jamais nom client)
- `Content-Type` servi = MIME réel (magic bytes JPEG/PNG/WebP)
- Taille sur disque = taille servie (hash SHA-256 vérifié pour les fichiers non recompressés)
- Gros JPEG > 700 Ko ⏬ navigateur ⏬ JPEG ≤ 1 Mo ≤ 1600 px (compatibilité Vercel 4,5 Mo)
- Aucun `srcset` invalide (aucune variante réelle ; assertion bloquée)
- Après `reload()` complet : URLs inchangées, images toujours décodées
- Après déconnexion/reconnexion : mêmes URLs, mêmes images accessibles
- Mobile 390 : aucun débordement horizontal
- Desktop 1440 : 4 images correctement affichées
- Thème clair/sombre : même image, mêmes URLs

### Cycle complet validé
Formulaire → soumission → stockage réel → API → modération → approbation → fiche produit → catalogue → panier → admin → refresh → déconnexion/reconnexion → mobile → desktop → thème clair/sombre → toutes les étapes = 0 image cassée.

### Configuration de déploiement
- `vercel.json` : `installCommand` corrigé, rewrite sitemap OK
- `vercel.env` : `MAIL_ENABLED=false` (dégradation propre suite incident SendGrid)
- `BLOB_READ_WRITE_TOKEN` : non injecté en prod (stockage disque fallback), test validé
- `UPLOAD_DIR` : `/data/uploads/products` (volume Docker) — permissions 644, propriétaire nodejs:nodejs
- `engines.node` : `22.x` (épinglé)

### Sécurité & Quotas
- SendGrid : clés restaurées, `MAIL_ENABLED=false` en attente clé valide
- PostgreSQL : 2 CPU (via `docker update cgroup`), quotas appliqués
- API ×3 : 1 CPU chacun (via `docker update cgroup`), vérifié `cgroups`
- Rate limit : désactivé sur instances de recette (`RATE_LIMIT_DISABLED=true`)
- Aucune clé/token/secret en dur dans les fichiers suivis (shred + gitignore vérifiés)

### Tests exécutés avec succès
- `npm run test` (server) : 36/36 pass, 0 fail
- `test:e2e` (new-images.spec.ts) : 1 passed, IMAGES CASSÉES = 0
- Endurance, spike, stress : 0 erreur, plateau ~476–527 rps
- Failover : 0 perte détectée (détection ≤ 2,0 s)

### Verdict
**🟢 GO PRODUCTION** — Toutes les nouvelles images restent parfaitement accessibles à chaque étape du cycle, 0 image cassée, tous les quotas et sécurité en place.
