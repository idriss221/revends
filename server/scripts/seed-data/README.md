/* =====================================================================
   SEED CATALOGUE DE DÉMONSTRATION
   ---------------------------------------------------------------------
   ⚠️ CE FICHIIER N'EST **PAS** UNE MIGRATION.
   Il vit dans `scripts/seed-data/`, hors de `migrations/`, parce que
   `migrate()` joue TOUT le répertoire `migrations/` — y compris dans la
   base de TEST remise à zéro avant chaque suite. Un seed de données ici
   polluait chaque run (mesuré : +25 articles démo et 246 articles au
   total dans `revends_test`, ce qui cassait les assertions de comptage
   comme `assert.equal(ids1.length, all.total)`).

   Usage :
     npm run seed:demo            # applique le catalogue démo
     npm run seed:demo -- --reset # repart de zéro puis réapplique

   Idempotent : ON CONFLICT DO NOTHING sur les slugs produits / e-mails.
   (Contenu identique à l'ancienne migration 011, déplacé ici.)
   ===================================================================== */

Le SQL exécutable est `011_seed_demo_catalog.sql` (même contenu qu'avant le
déplacement). Il est rejoué sur **le primary de CHAQUE shard**, comme le fait
`migrate()` — les tables de référence sont en broadcast.

Contenu déposé : 1 compte de modération, 4 vendeurs, 25 articles `AVAILABLE`
(répartis sur 6 univers, dont 16 à ≤ 25 000 FCFA pour « Trouvailles à petits
prix ») et 48 photos Unsplash **vérifiées HTTP 200** au moment de l'écriture.
