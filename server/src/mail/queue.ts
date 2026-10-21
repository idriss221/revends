import { sendMail } from './mailer.js';
import type { MailEvent, TemplateVars } from './templates.js';
import { afterCommit } from '../utils/db.js';
import { findEmailById } from '../repositories/users.repository.js';

/**
 * Programmateur des 9 déclencheurs e-mail (C1 / US-V5-01, 11 envois).
 *
 * Point d'ACCROCHE UNIQUE : chaque service métier appelle `queueMail()` depuis
 * l'intérieur de sa transaction, exactement à l'endroit où il écrit sa
 * notification in-app. On ne peut donc pas oublier un déclencheur sans le voir
 * dans le même `insertNotification`, et CA-V5-010 (notifications in-app
 * inchangées) est vérifiable par simple lecture.
 *
 * Trois invariants tenus ici, pas dans les appelants :
 * 1. **résolution par identifiant** (CA-V5-011) : l'e-mail est lu en base via
 *    l'`id` de l'utilisateur ; aucune adresse n'entre par l'API ;
 * 2. **envoi après commit** (CA-V5-003, PO-V5-14/P8) : `afterCommit` programme
 *    l'envoi, un rollback l'annule ;
 * 3. **best-effort** (CA-V5-002) : `sendMail` ne lève jamais et l'effet
 *    post-commit est isolé ; l'action métier ne dépend pas du résultat.
 */

/**
 * Programme l'envoi d'un email à `userId` APRÈS le commit de la transaction en
 * cours. À appeler depuis le callback de `withTransaction`.
 */
export function queueMail(userId: number, event: MailEvent, vars: TemplateVars = {}): void {
  // `vars` est repris tel quel : l'échappement HTML est fait par
  // `renderTemplate` (source UNIQUE), donc ici on ne pré-échappe rien — sinon
  // un nom de produit contenant `&` s'afficherait `&amp;` dans le mail.
  afterCommit(async () => {
    // Résolution LORS de l'envoi : si le compte a disparu entre-temps,
    // `sendMail` ignore et journalise (CA-V5-012) sans faire échouer l'action.
    // L'accès SQL vit dans le repository (séparation couches §1).
    const email = await findEmailById(userId);
    await sendMail(userId, email, event, vars);
  });
}
