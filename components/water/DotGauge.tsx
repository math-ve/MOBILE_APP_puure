import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { ds, typography } from '../../lib/theme'

// Jauge en 12 pastilles (maquette P04 / P05) : les pastilles pleines
// représentent la part de cartouche restante, dans le sens horaire depuis
// le haut. Ambre quand la cartouche arrive au bout.

// Centres des 12 pastilles dans un repère 220 × 220 (repris de la maquette).
const DOTS: [number, number][] = [
  [110, 24], [153, 35.5], [184.5, 67], [196, 110], [184.5, 153], [153, 184.5],
  [110, 196], [67, 184.5], [35.5, 153], [24, 110], [35.5, 67], [67, 35.5],
]

export const AMBER = '#E9A23B'

type Props = {
  /** Part restante, 0–100. */
  remaining: number
  /** Libellé sous le chiffre (« restant »). */
  caption: string
  warning?: boolean
  size?: number
  accessibilityLabel: string
}

export default function DotGauge({ remaining, caption, warning, size = 240, accessibilityLabel }: Props) {
  const target = remaining <= 0 ? 0 : Math.max(1, Math.ceil((remaining / 100) * DOTS.length))
  // Les pastilles s'allument une à une à l'arrivée.
  const [lit, setLit] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    setLit(0)
    let n = 0
    timer.current = setInterval(() => {
      n += 1
      setLit(Math.min(n, target))
      if (n >= target && timer.current) clearInterval(timer.current)
    }, 45)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [target])

  const fill = warning ? AMBER : ds.blue
  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size} viewBox="0 0 220 220">
        {DOTS.map(([cx, cy], i) => (
          <Circle key={i} cx={cx} cy={cy} r={16} fill={i < lit ? fill : ds.line} />
        ))}
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.center}>
          <Text style={styles.value}>{Math.round(remaining)} %</Text>
          <Text style={styles.caption}>{caption}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  value: { fontFamily: typography.fontFamily.medium, fontSize: 40, lineHeight: 44, letterSpacing: -0.8, color: ds.ink },
  caption: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.body },
})
