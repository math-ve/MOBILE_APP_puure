import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Svg, { Path } from 'react-native-svg'
import { ds, typography } from '../../lib/theme'
import type { FilterType } from '../../lib/water'

// « Vos systèmes Puure » (maquette P04) : robinet, douche, sous-évier.
// Installé = contour bleu + coche ; sinon « Ajouter » ouvre l'ajout de filtre.

export const SYSTEMS: { type: FilterType; image: any }[] = [
  { type: 'robinet', image: require('../../assets/products/tap-system.png') },
  { type: 'douche', image: require('../../assets/products/shower-system.png') },
  { type: 'sous-evier', image: require('../../assets/products/under-sink-system.png') },
]

const GAP = 8

export default function SystemsRow({ owned }: { owned: string[] }) {
  const { t } = useTranslation()
  // Image carrée en points : width '100%' + aspectRatio s'étire sur iPhone
  // (Yoga retombe sur la taille intrinsèque du PNG).
  const [rowWidth, setRowWidth] = useState(0)
  const side = rowWidth > 0 ? Math.floor((rowWidth - GAP * (SYSTEMS.length - 1)) / SYSTEMS.length) : 0
  return (
    <View style={styles.row} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
      {SYSTEMS.map((s) => {
        const has = owned.includes(s.type)
        const label = t(`water:systems.${s.type}`)
        return (
          <Pressable
            key={s.type}
            disabled={has}
            onPress={() => router.push({ pathname: '/add-filter', params: { type: s.type } })}
            accessibilityRole={has ? undefined : 'button'}
            accessibilityLabel={`${label}, ${has ? t('water:systems.installed') : t('water:systems.add')}`}
            style={({ pressed }) => [styles.card, has && styles.cardOwned, pressed && { opacity: 0.85 }]}
          >
            <Image source={s.image} style={[styles.image, { height: side }]} resizeMode="cover" />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>{label}</Text>
              <Text style={has ? styles.status : styles.add} numberOfLines={1}>
                {has ? t('water:systems.installed') : t('water:systems.add')}
              </Text>
            </View>
            {has && (
              <View style={styles.check}>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <Path d="M5 12l5 5L20 7" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: GAP },
  card: { flex: 1, minWidth: 0, borderRadius: 20, borderWidth: 1, borderColor: ds.line, backgroundColor: ds.raised, overflow: 'hidden' },
  cardOwned: { borderWidth: 2, borderColor: ds.blue },
  image: { width: '100%' },
  text: { paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  name: { fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink },
  status: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.muted },
  add: { fontFamily: typography.fontFamily.medium, fontSize: 14, color: ds.blue },
  check: {
    position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12,
    backgroundColor: ds.blue, alignItems: 'center', justifyContent: 'center',
  },
})
