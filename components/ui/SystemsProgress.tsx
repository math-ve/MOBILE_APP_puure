import { useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Linking, Animated, Easing,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import theme from '../../lib/theme'

// ─── Catalogue des systèmes Puure ──────────────────────────
// `key` correspond à la valeur `filter_type` stockée sur les filtres.
// `labelKey` pointe vers systems:* (i18n).
const SYSTEMS = [
  {
    key: 'robinet' as const,
    labelKey: 'systems:tap',
    image: require('../../assets/products/tap-system.png'),
    url: 'https://puurefilters.com/products/tap-system',
  },
  {
    key: 'douche' as const,
    labelKey: 'systems:shower',
    image: require('../../assets/products/shower-system.png'),
    url: 'https://puurefilters.com/products/shower-system',
  },
]

interface SystemsProgressProps {
  /** Types de filtres actifs possédés par l'utilisateur (ex: ['robinet']) */
  ownedTypes: string[]
  /** Style de conteneur optionnel */
  style?: any
}

export default function SystemsProgress({ ownedTypes, style }: SystemsProgressProps) {
  const { t } = useTranslation()
  const owned = new Set(ownedTypes)
  const ownedCount = SYSTEMS.filter(s => owned.has(s.key)).length
  const total = SYSTEMS.length
  const complete = ownedCount === total

  // Message dynamique selon la complétion
  const message = complete
    ? t('systems:messageComplete')
    : ownedCount === 0
      ? t('systems:messageNone')
      : t('systems:messagePartial')

  return (
    <View style={[styles.card, style]}>
      {/* En-tête : titre + compteur */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('systems:heading').toUpperCase()}</Text>
        <View style={[styles.counter, complete && styles.counterComplete]}>
          <Text style={[styles.counterText, complete && styles.counterTextComplete]}>
            {ownedCount}/{total}
          </Text>
        </View>
      </View>

      {/* Tuiles produits */}
      <View style={styles.tilesRow}>
        {SYSTEMS.map(sys => (
          <SystemTile key={sys.key} system={sys} owned={owned.has(sys.key)} />
        ))}
      </View>

      {/* Message dynamique */}
      <View style={[styles.messageWrap, complete && styles.messageWrapComplete]}>
        <Text style={[styles.message, complete && styles.messageComplete]}>{message}</Text>
      </View>
    </View>
  )
}

// ─── Tuile individuelle ────────────────────────────────────
function SystemTile({ system, owned }: { system: typeof SYSTEMS[number]; owned: boolean }) {
  const { t } = useTranslation()
  const label = t(system.labelKey)
  const scale = useRef(new Animated.Value(1)).current

  // Léger pulse d'appel à l'action sur les systèmes manquants
  useEffect(() => {
    if (owned) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.03, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [owned])

  const content = (
    <Animated.View style={[styles.tile, owned ? styles.tileOwned : styles.tileMissing, { transform: [{ scale: owned ? 1 : scale }] }]}>
      {/* Image produit */}
      <View style={styles.imageWrap}>
        <Image
          source={system.image}
          style={[styles.image, !owned && styles.imageMissing]}
          resizeMode="cover"
        />
        {/* Voile grisant sur les systèmes non possédés */}
        {!owned && <View style={styles.imageVeil} />}
      </View>

      {/* Pied de tuile */}
      <View style={styles.tileFooter}>
        <Text style={[styles.tileLabel, !owned && styles.tileLabelMissing]}>{label}</Text>
        {owned ? (
          <View style={styles.ownedBadge}>
            <Text style={styles.ownedCheck}>✓</Text>
          </View>
        ) : (
          <Text style={styles.addCta}>{t('systems:add')}</Text>
        )}
      </View>
    </Animated.View>
  )

  // Possédé : statique. Manquant : ouvre la page produit Shopify.
  if (owned) return content
  return (
    <TouchableOpacity
      style={{ flex: 1 }}
      activeOpacity={0.85}
      onPress={() => Linking.openURL(system.url)}
      accessibilityRole="link"
      accessibilityLabel={t('systems:discoverA11y', { label })}
    >
      {content}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius['2xl'],
    padding: theme.spacing[5],
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing[4],
  },
  title: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.xs,
    letterSpacing: theme.typography.letterSpacing.caps,
    color: theme.colors.textLight,
  },
  counter: {
    backgroundColor: theme.colors.bluePale,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 3,
  },
  counterComplete: {
    backgroundColor: 'rgba(30,187,110,0.12)',
  },
  counterText: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.sm,
    color: theme.colors.blue,
  },
  counterTextComplete: {
    color: theme.colors.success,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: theme.spacing[3],
  },
  tile: {
    flex: 1,
    borderRadius: theme.radius.xl,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: theme.colors.inputBg,
  },
  tileOwned: {
    borderColor: theme.colors.blue,
  },
  tileMissing: {
    borderColor: theme.colors.border,
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    backgroundColor: theme.colors.white,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageMissing: {
    opacity: 0.45,
  },
  imageVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(138,155,191,0.10)',
  },
  tileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  tileLabel: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size.base,
    color: theme.colors.textPrimary,
  },
  tileLabelMissing: {
    color: theme.colors.textLight,
  },
  ownedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownedCheck: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  addCta: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: theme.typography.size.sm,
    color: theme.colors.blue,
  },
  messageWrap: {
    marginTop: theme.spacing[4],
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  messageWrapComplete: {
    backgroundColor: 'rgba(30,187,110,0.08)',
  },
  message: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textMid,
    textAlign: 'center',
    lineHeight: theme.typography.size.sm * theme.typography.lineHeight.normal,
  },
  messageComplete: {
    color: theme.colors.success,
    fontFamily: theme.typography.fontFamily.semiBold,
  },
})
