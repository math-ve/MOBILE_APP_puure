import { View, StyleSheet } from 'react-native'
import { Colors, Radius } from '../../lib/theme'

// Icônes construites avec des formes View — pas de dépendance native SVG
// Style fidèle au thème Puure: trait fin, formes géométriques épurées

type IconName = 'home' | 'box' | 'refresh' | 'drop' | 'headphones'

interface IconProps {
  name: IconName
  size?: number
  color?: string
  duo?: boolean
}

export function Icon({ name, size = 22, color = Colors.muted, duo = false }: IconProps) {
  const s = size / 22 // facteur d'échelle
  const bg = duo ? `${color}22` : 'transparent'

  const line = (w: number, h: number, extra?: object) => ({
    width: w * s,
    height: h * s,
    backgroundColor: color,
    borderRadius: 1 * s,
    ...extra,
  })

  switch (name) {
    case 'home': {
      // Maison: toit triangulaire + corps + porte
      const roof = 1.5 * s
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {/* Toit — deux diagonales */}
          <View style={{ position: 'absolute', top: 2 * s, left: 0, right: 0, alignItems: 'center' }}>
            <View style={{
              width: 0, height: 0,
              borderLeftWidth: 11 * s, borderRightWidth: 11 * s, borderBottomWidth: 8 * s,
              borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color,
            }} />
          </View>
          {/* Corps */}
          <View style={{
            position: 'absolute', bottom: 2 * s,
            width: 15 * s, height: 10 * s,
            backgroundColor: duo ? `${color}22` : 'transparent',
            borderColor: color, borderWidth: 1.5 * s,
            borderTopWidth: 0,
          }} />
          {/* Porte */}
          <View style={{
            position: 'absolute', bottom: 2 * s,
            width: 5 * s, height: 6 * s,
            backgroundColor: color, opacity: 0.9,
          }} />
        </View>
      )
    }

    case 'box': {
      // Boîte: carré + ligne médiane + diagonale
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: 16 * s, height: 14 * s,
            borderColor: color, borderWidth: 1.5 * s,
            borderRadius: 2 * s,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'flex-start',
            overflow: 'hidden',
          }}>
            {/* Ligne du couvercle */}
            <View style={{ width: '100%', height: 1.5 * s, backgroundColor: color, marginTop: 4 * s }} />
          </View>
          {/* Ligne verticale centre haut */}
          <View style={{ position: 'absolute', top: 2 * s, width: 1.5 * s, height: 4 * s, backgroundColor: color }} />
        </View>
      )
    }

    case 'refresh': {
      // Flèches circulaires: deux arcs semi-circulaires avec pointes
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {/* Arc supérieur */}
          <View style={{
            position: 'absolute',
            width: 14 * s, height: 14 * s,
            borderRadius: 7 * s,
            borderWidth: 1.8 * s,
            borderColor: color,
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent',
            top: 3 * s,
          }} />
          {/* Arc inférieur */}
          <View style={{
            position: 'absolute',
            width: 14 * s, height: 14 * s,
            borderRadius: 7 * s,
            borderWidth: 1.8 * s,
            borderColor: color,
            borderTopColor: 'transparent',
            borderRightColor: 'transparent',
            top: 3 * s,
          }} />
          {/* Pointe haut-droite */}
          <View style={{
            position: 'absolute', top: 2 * s, right: 3 * s,
            width: 0, height: 0,
            borderTopWidth: 3.5 * s, borderBottomWidth: 3.5 * s, borderLeftWidth: 5 * s,
            borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color,
          }} />
          {/* Pointe bas-gauche */}
          <View style={{
            position: 'absolute', bottom: 2 * s, left: 3 * s,
            width: 0, height: 0,
            borderTopWidth: 3.5 * s, borderBottomWidth: 3.5 * s, borderRightWidth: 5 * s,
            borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: color,
          }} />
        </View>
      )
    }

    case 'drop': {
      // Goutte d'eau — forme ronde en bas, pointue en haut (logo Puure inversé)
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {/* Corps de la goutte */}
          <View style={{
            width: 13 * s, height: 16 * s,
            borderRadius: 6.5 * s,
            borderTopLeftRadius: 6.5 * s,
            borderTopRightRadius: 6.5 * s,
            borderBottomLeftRadius: 6.5 * s,
            borderBottomRightRadius: 6.5 * s,
            borderTopWidth: 0,
            backgroundColor: bg,
            borderColor: color,
            borderWidth: 1.8 * s,
            marginTop: 4 * s,
          }} />
          {/* Pointe haute */}
          <View style={{
            position: 'absolute',
            top: 0,
            width: 0, height: 0,
            borderLeftWidth: 5 * s, borderRightWidth: 5 * s, borderBottomWidth: 8 * s,
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color,
          }} />
          {/* Reflet interne */}
          {duo && (
            <View style={{
              position: 'absolute',
              bottom: 5 * s,
              width: 5 * s, height: 6 * s,
              borderRadius: 2.5 * s,
              backgroundColor: color,
              opacity: 0.4,
            }} />
          )}
        </View>
      )
    }

    case 'headphones': {
      // Casque: arc + deux oreillettes
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {/* Arc supérieur */}
          <View style={{
            position: 'absolute', top: 2 * s,
            width: 16 * s, height: 10 * s,
            borderTopLeftRadius: 8 * s,
            borderTopRightRadius: 8 * s,
            borderWidth: 1.8 * s,
            borderBottomWidth: 0,
            borderColor: color,
            backgroundColor: 'transparent',
          }} />
          {/* Oreillette gauche */}
          <View style={{
            position: 'absolute', bottom: 3 * s, left: 2.5 * s,
            width: 5 * s, height: 7 * s,
            borderRadius: 2.5 * s,
            backgroundColor: bg,
            borderColor: color, borderWidth: 1.8 * s,
          }} />
          {/* Oreillette droite */}
          <View style={{
            position: 'absolute', bottom: 3 * s, right: 2.5 * s,
            width: 5 * s, height: 7 * s,
            borderRadius: 2.5 * s,
            backgroundColor: bg,
            borderColor: color, borderWidth: 1.8 * s,
          }} />
        </View>
      )
    }

    default:
      return <View style={{ width: size, height: size }} />
  }
}
