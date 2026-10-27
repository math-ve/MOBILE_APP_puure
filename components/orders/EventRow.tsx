import { StyleSheet, Text, View } from 'react-native'
import { eventTime } from '../../lib/tracking'
import { ds, typography } from '../../lib/theme'

// Un événement de suivi sur la frise verticale (maquettes P11, P16) :
// le plus récent en bleu et en gras, les autres en gris.

export default function EventRow({ event, first, last }: {
  event: { time: string | null; description: string | null }; first: boolean; last: boolean
}) {
  return (
    <View style={styles.event}>
      <View style={styles.rail}>
        <View style={[styles.dot, first && { backgroundColor: ds.blue }]} />
        {!last && <View style={styles.line} />}
      </View>
      <View style={[styles.text, last && { paddingBottom: 10 }]}>
        <Text style={[styles.title, first && { fontFamily: typography.fontFamily.medium }]}>{event.description}</Text>
        <Text style={styles.time}>{eventTime(event.time)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  event: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ds.line, marginTop: 5 },
  line: { flex: 1, width: 2, backgroundColor: ds.line },
  text: { flex: 1, paddingBottom: 14, gap: 2 },
  title: { fontFamily: typography.fontFamily.regular, fontSize: 15, color: ds.ink },
  time: { fontFamily: typography.fontFamily.regular, fontSize: 13, color: ds.muted },
})
