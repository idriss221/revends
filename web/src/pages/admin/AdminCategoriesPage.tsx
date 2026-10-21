import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { EMPTY_COPY, TOAST_COPY } from '../../lib/constants'
import { adminMenu } from '../../lib/menus'
import { useAdminStats } from '../../hooks/useAdminStats'
import { DashboardLayout } from '../../components/layout/DashboardLayout'
import { AdminPageHeader } from '../../components/admin/AdminPageHeader'
import { AdminTable, type AdminColumn } from '../../components/admin/AdminTable'
import { ConfirmAction } from '../../components/admin/ConfirmAction'
import { buttonClasses } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { FormField } from '../../components/ui/FormField'
import { useToast } from '../../lib/toast'

/**
 * Une ligne = une racine (`level: 0`) ou une sous-catégorie (`level: 1`).
 * `level` pilote l'indentation (aucune attribution de style en ligne) ;
 * `rootId` identifie la racine
 * parente et sert de `<tbody>` (une racine + ses enfants = un groupe) ; les
 * champs sont repris explicitement — pas de spread — pour rester un `Row` typé
 * (le contrat API garantit `active: boolean` aux 2 niveaux).
 */
type Row = { id: number; name: string; slug: string; active: boolean; level: 0 | 1; rootId: number }

/**
 * Catégories (admin) — spec-admin §6-7.
 *
 * · hiérarchie **sans style inline** (CA-V5-033) : deux classes de ligne
 *   (racine `pl-4`, enfant `border-l-2 border-line pl-10` + **étiquette textuelle**
 *   « sous-catégorie », lisible et pas seulement indenté) ; racines et enfants
 *   sont splittés en **deux `<tbody>`** via `rowGroup` (spec §6-7) ;
 * · actions : `Renommer` · `Activer / Désactiver` — **jamais « Supprimer »** (RG-V5-08) ;
 * · liste fermée : pas de pagination.
 */
export function AdminCategoriesPage() {
  const stats = useAdminStats()
  const toast = useToast()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)
  const [name, setName] = useState('')
  const [toggleTarget, setToggleTarget] = useState<Row | null>(null)

  const categories = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.adminCategories(),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'categories'] })
    qc.invalidateQueries({ queryKey: ['categories'] })
  }

  const rename = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('Aucune catégorie sélectionnée.')
      return api.patchCategory(editing.id, { name: name.trim() })
    },
    onSuccess: () => {
      toast('success', TOAST_COPY.categoryRenamed)
      setEditing(null)
      invalidate()
    },
    onError: (err) => toast('error', err instanceof Error ? err.message : TOAST_COPY.categoryRenameFailed),
  })

  const toggle = useMutation({
    mutationFn: (c: Row) => api.patchCategory(c.id, { active: !c.active }),
    onSuccess: () => {
      toast('success', TOAST_COPY.categoryStatusUpdated)
      setToggleTarget(null)
      invalidate()
    },
    onError: (err) => toast('error', err instanceof Error ? err.message : TOAST_COPY.updateFailed),
  })

  const openEdit = (c: Row) => {
    setEditing({ id: c.id, name: c.name })
    setName(c.name)
  }

  const rows: Row[] = (categories.data?.categories ?? []).flatMap((root) => [
    { id: root.id, name: root.name, slug: root.slug, active: root.active, level: 0 as const, rootId: root.id },
    ...root.children.map((child) => ({
      id: child.id,
      name: child.name,
      slug: child.slug,
      // `Category.active` est optionnel côté contrat public : absent = active.
      active: child.active ?? true,
      level: 1 as const,
      rootId: root.id,
    })),
  ])

  const roots = categories.data?.categories.length ?? 0
  const children = rows.length - roots

  const columns: AdminColumn<Row>[] = [
    {
      key: 'name',
      header: 'Nom',
      cell: (r) =>
        r.level === 0 ? (
          <div className="font-semibold text-ink">{r.name}</div>
        ) : (
          /* hiérarchie lisible : indentation + étiquette textuelle (spec-admin §6-7) */
          <div className="pl-6 text-sm text-muted">
            {r.name}
            <span className="ml-2 text-xs text-faint">sous-catégorie</span>
          </div>
        ),
    },
    {
      key: 'status',
      header: 'Statut',
      cell: (r) => <StatusBadge kind={r.active ? 'approved' : 'neutral'} label={r.active ? 'Active' : 'Inactive'} dot />,
    },
    {
      key: 'actions',
      header: 'Actions',
      widthClass: 'text-right',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => openEdit(r)}
            aria-label={`Renommer la catégorie « ${r.name} »`}
            className={buttonClasses('outline', 'sm')}
          >
            <i className="fas fa-pen-to-square" aria-hidden="true" /> Renommer
          </button>
          <button
            type="button"
            onClick={() => setToggleTarget(r)}
            aria-label={`${r.active ? 'Désactiver' : 'Activer'} la catégorie « ${r.name} »`}
            className={buttonClasses(r.active ? 'danger' : 'positive', 'sm')}
          >
            <i className={`fas ${r.active ? 'fa-ban' : 'fa-check'}`} aria-hidden="true" />
            {r.active ? 'Désactiver' : 'Activer'}
          </button>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout items={adminMenu(stats.data?.pendingProducts ?? 0)}>
      <AdminPageHeader title="Catégories" subtitle={`${roots} racines · ${children} sous-catégories`} />

      <AdminTable
        caption="Catégories"
        noun="catégories"
        minWidth="sm"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowGroup={(r) => String(r.rootId)}
        rowClassName={(r) => (r.level === 0 ? '' : 'border-l-2 border-line')}
        isLoading={categories.isPending}
        isRefreshing={categories.isFetching}
        isError={categories.isError}
        error={categories.error}
        onRetry={() => void categories.refetch()}
        empty={{ ...EMPTY_COPY.adminCategories }}
      />

      <ConfirmAction
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onConfirm={() => rename.mutate()}
        title="Renommer la catégorie"
        confirmLabel="Enregistrer"
        tone="primary"
        urgency="none"
        loading={rename.isPending}
        size="sm"
        // Nom vide (ou espaces seuls) = 400 serveur prévisible : le bouton est
        // désactivé côté client, comme la raison d'annulation d'une commande.
        confirmDisabled={!name.trim()}
        message="Le nouveau nom sera visible immédiatement sur le catalogue."
      >
        <FormField label="Nouveau nom" htmlFor="category-name" required>
          <input
            id="category-name"
            className="field-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            // 100 = `max(100)` de `patchCategorySchema` (validation.ts:266) : à
            // 80, un nom valide côté serveur était refusé par le client sans motif.
            maxLength={100}
            required
          />
        </FormField>
      </ConfirmAction>

      <ConfirmAction
        open={Boolean(toggleTarget)}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => toggleTarget && toggle.mutate(toggleTarget)}
        title={toggleTarget?.active ? 'Désactiver la catégorie' : 'Activer la catégorie'}
        confirmLabel={toggleTarget?.active ? 'Désactiver' : 'Activer'}
        tone={toggleTarget?.active ? 'secondary' : 'positive'}
        urgency={toggleTarget?.active ? 'warning' : 'info'}
        loading={toggle.isPending}
        size="sm"
        message={
          toggleTarget?.active
            ? `« ${toggleTarget.name} » n’apparaîtra plus dans le catalogue. Les articles existants ne sont pas supprimés.`
            : `« ${toggleTarget?.name ?? ''} » réapparaîtra dans le catalogue.`
        }
      />
    </DashboardLayout>
  )
}
