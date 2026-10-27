import { Image, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Sheet from '../ds/Sheet'
import PillButton from '../ds/PillButton'
import { ds, typography } from '../../lib/theme'
import { formatCurrency, formatDate } from '../../lib/i18n/format'
import { pastOrderStatus } from '../../lib/plan'

// Détail d'une commande passée de l'abonnement (maquette P21).

type Props = {
  order: any
  /** « Recharge 6 mois » : formule affichée sous le nom du produit. */
  plan: string
  fallbackImage: string | null
  currency: string
  address: any
  onClose: () => void
}

export default function OrderDetailSheet({ order, plan, fallbackImage, currency, address, onClose }: Props) {
  const { t } = useTranslation()
  const items: any[] = Array.isArray(order.variantList) ? order.variantList : []
  const status = pastOrderStatus(order)
  const paid = (order.status ?? '').toUpperCase() === 'SUCCESS'
  const total = Number(order.orderAmount ?? 0)
  const money = (n: number) => formatCurrency(n, currency)

  return (
    <Sheet
      title={t('subscription:orderTitle', { name: order.orderName ?? '' })}
      subtitle={order.billingDate ? formatDate(order.billingDate) : undefined}
      onClose={onClose}
      footer={<PillButton label={t('subscription:close')} onPress={onClose} />}
    >
      <View style={styles.badges}>
        {paid && <View style={[styles.badge, { backgroundColor: ds.fill }]}><Text style={[styles.badgeText, { color: ds.body }]}>{t('subscription:badgePaid')}</Text></View>}
        <View style={[styles.badge, { backgroundColor: status.bg }]}><Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text></View>
      </View>

      {items.length > 0 && <Text style={styles.caps}>{t('subscription:products').toLocaleUpperCase()}</Text>}
      {items.map((item, i) => {
        const image = item.image ?? item.variantImage ?? fallbackImage
        return (
          <View key={i} style={styles.item}>
            {image ? <Image source={{ uri: image }} style={styles.thumb} /> : <View style={styles.thumb} />}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.itemName} numberOfLines={2}>{item.productTitle ?? item.title ?? '—'}</Text>
              <Text style={styles.itemMeta}>{t('subscription:productLine', { plan, count: item.quantity ?? 1 })}</Text>
            </View>
            {item.price != null && <Text style={styles.itemPrice}>{money(Number(item.price) * (item.quantity ?? 1))}</Text>}
          </View>
        )
      })}

      <View style={styles.block}>
        <Row label={t('subscription:subtotal')} value={money(total)} />
        <Row label={t('subscription:shipping')} value={money(0)} />
        <View style={styles.row}>
          <Text style={styles.totalLabel}>{t('subscription:total').toLocaleUpperCase()}</Text>
          <Text style={styles.totalValue}>{money(total)}</Text>
        </View>
      </View>

      {address && (
        <View style={[styles.block, { gap: 6 }]}>
          <Text style={styles.caps}>{t('subscription:shippingAddress').toLocaleUpperCase()}</Text>
          <Text style={styles.address}>
            {[
              [address.firstName, address.lastName].filter(Boolean).join(' '),
              [[address.address1, address.address2].filter(Boolean).join(' '), [address.zip, address.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
            ].filter(Boolean).join('\n')}
          </Text>
        </View>
      )}
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: -8, marginBottom: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { fontFamily: typography.fontFamily.medium, fontSize: 14 },
  caps: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, letterSpacing: 0.96, color: ds.muted },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  thumb: { width: 52, height: 52, borderRadius: 12, borderWidth: 1, borderColor: ds.line, backgroundColor: ds.fill },
  itemName: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },
  itemMeta: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: ds.muted },
  itemPrice: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.ink },
  block: { borderTopWidth: 1, borderTopColor: ds.line, paddingTop: 16, marginTop: 8, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.body },
  rowValue: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.ink },
  totalLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, letterSpacing: 0.96, color: ds.ink },
  totalValue: { fontFamily: typography.fontFamily.semiBold, fontSize: 15, color: ds.ink },
  address: { fontFamily: typography.fontFamily.regular, fontSize: 15, lineHeight: 21, color: ds.ink },
})
