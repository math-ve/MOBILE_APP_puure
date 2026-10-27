import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { FlowScreen } from '../components/ds/Flow'
import EventRow from '../components/orders/EventRow'
import { cachedTracking, fetchTracking, trackingLabel, TrackingData } from '../lib/tracking'
import { ds, typography } from '../lib/theme'

// Historique complet du suivi (maquette P16).

export default function TrackingHistoryScreen() {
  const { t } = useTranslation()
  const { tracking_number, order_number, carrier } = useLocalSearchParams<{ tracking_number: string; order_number?: string; carrier?: string }>()
  const [data, setData] = useState<TrackingData | null>(() => cachedTracking(tracking_number))

  useEffect(() => {
    if (!data && tracking_number) fetchTracking(tracking_number).then(setData).catch(() => {})
  }, [tracking_number])

  const label = trackingLabel(data?.status ?? null)
  const meta = [carrier, order_number ? t('trackingDs:orderRef', { number: `#${order_number}` }) : null].filter(Boolean).join(' · ')

  return (
    <FlowScreen title={t('trackingDs:historyTitle')} onBack={() => router.back()}>
      {!data ? <ActivityIndicator color={ds.blue} style={{ marginTop: 40 }} /> : (
        <>
          <View style={styles.summary}>
            <View style={{ flex: 1, gap: 2 }}>
              {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
              <Text style={styles.number} selectable>{data.tracking_number}</Text>
            </View>
            <View style={[styles.pill, label.tone === 'red' && { backgroundColor: ds.redSoft }]}>
              <Text style={[styles.pillText, label.tone === 'red' && { color: ds.red }]}>{label.text}</Text>
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.caps}>{t('trackingDs:allEvents', { count: data.events.length }).toLocaleUpperCase()}</Text>
            {data.events.map((e, i) => <EventRow key={i} event={e} first={i === 0} last={i === data.events.length - 1} />)}
          </View>
        </>
      )}
    </FlowScreen>
  )
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16,
  },
  meta: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: ds.muted },
  number: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },
  pill: { backgroundColor: ds.blueSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontFamily: typography.fontFamily.medium, fontSize: 13, color: ds.blue },
  card: { backgroundColor: ds.raised, borderWidth: 1, borderColor: ds.line, borderRadius: ds.radius.card, padding: 18, paddingBottom: 8, gap: 4 },
  caps: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, letterSpacing: 0.96, color: ds.muted, marginBottom: 10 },
})
