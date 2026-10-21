import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { timeAgo } from '../lib/format'
import { Crumb, SiteEmpty, SiteHead } from '../components/site/SiteBits'
import { Button } from '../components/ui/Button'
import { TableSkeleton } from '../components/ui/Loading'
import { ErrorMessage } from '../components/ui/ErrorMessage'
import { Pagination } from '../components/ui/Pagination'
import { useState } from 'react'
import type { Notification } from '../lib/types'
import { EMPTY_COPY } from '../lib/constants'
import { Ico } from '../components/brand/Ico'

const NOTIF_ICON: Record<string, string> = {
  article_submitted: 'plus-circle',
  article_approved: 'circle-check',
  article_rejected: 'circle-info',
  article_reserved: 'clock',
  article_sold: 'tag',
  order_created: 'bag',
  payment_confirmed: 'credit-card',
  seller_paid: 'credit-card',
  reservation_expired: 'clock',
}

function notifVisual(n: Notification): string {
  return NOTIF_ICON[n.type] ?? 'bell'
}

/** Page Notifications — vocabulaire Bureau. */
export function NotificationsPage() {
  const { unreadNotifications, setUnread } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)

  const notifications = useQuery({
    queryKey: ['notifications', page],
    queryFn: () => api.notifications({ page, per_page: 15 }),
  })

  const markRead = useMutation({
    mutationFn: (id: number) => api.markNotificationRead(id),
    onSuccess: (res, id) => {
      qc.setQueriesData({ queryKey: ['notifications'] }, (old?: { items: Notification[] }) => {
        if (!old) return old
        return {
          ...old,
          items: old.items.map((n) => (n.id === id ? { ...n, read: true, readAt: res.notification.readAt } : n)),
        }
      })
      setUnread(Math.max(0, unreadNotifications - 1))
    },
  })

  const markAll = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      qc.setQueriesData({ queryKey: ['notifications'] }, (old?: { items: Notification[] }) => {
        if (!old) return old
        return { ...old, items: old.items.map((n) => ({ ...n, read: true })) }
      })
      setUnread(0)
    },
  })

  return (
    <div className="wrap">
      <Crumb items={[{ label: 'Notifications' }]} />
      <SiteHead level={1} title="Notifications" sub="Tenez-vous au courant de vos articles, ventes et commandes." />

      {notifications.isError && <ErrorMessage error={notifications.error} showCode />}

      {notifications.isPending && <TableSkeleton rows={4} />}

      {notifications.isSuccess && notifications.data.items.length === 0 && (
        <SiteEmpty
          icon="bell"
          title={EMPTY_COPY.notifications.title}
          action={{ label: 'Voir mes articles', to: '/mes-articles' }}
        >
          {EMPTY_COPY.notifications.description}
        </SiteEmpty>
      )}

      {notifications.isSuccess && notifications.data.items.length > 0 && (
        <div className="box">
          <div className="rv-stack-bar">
            <Button variant="outline" size="sm" loading={markAll.isPending} onClick={() => markAll.mutate()}>
              Tout marquer comme lu
            </Button>
          </div>
          <div className="notif-stack">
            {notifications.data.items.map((n) => {
              const icon = notifVisual(n)
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.read && markRead.mutate(n.id)}
                  className={`rv-notif${n.read ? '' : ' unread'}`}
                >
                  <div className="prod-cell">
                    <div className="prod-thumb" aria-hidden="true">
                      <Ico name={icon} cls="sm" />
                    </div>
                    <div className="rv-notif-body">
                      <div className="rv-notif-top">
                        <div className="prod-name">{n.title}</div>
                        {!n.read && <span aria-label="Non lue" className="rv-notif-dot" />}
                      </div>
                      <div className="prod-meta">{n.message}</div>
                      <div className="prod-meta">{timeAgo(n.createdAt)}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          <Pagination
            page={notifications.data.page}
            totalPages={notifications.data.totalPages}
            total={notifications.data.total}
            noun="notifications"
            onChange={setPage}
          />
        </div>
      )}
    </div>
  )
}
