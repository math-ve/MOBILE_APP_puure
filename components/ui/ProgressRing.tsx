import { useEffect, useRef } from 'react'
import { Animated, View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg'
import theme from '../../lib/theme'

interface ProgressRingProps {
  progress: number
  size?: number
  strokeWidth?: number
  label?: string
  sublabel?: string
  showPercentage?: boolean
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

export default function ProgressRing({
  progress,
  size = 200,
  strokeWidth = 14,
  label,
  sublabel,
  showPercentage = true,
}: ProgressRingProps) {
  const animatedProgress = useRef(new Animated.Value(0)).current

  const r = (size - strokeWidth) / 2
  const circumference = r * 2 * Math.PI
  const arc = circumference * 0.75

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 1200,
      useNativeDriver: false,
    }).start()
  }, [progress])

  // L'anneau se remplit proportionnellement à animatedProgress (0 → progress).
  // L'interpolation mappe 0 % → offset plein (arc, rien de dessiné) et
  // 100 % → offset 0 (arc entier dessiné). Auparavant `progress` était
  // appliqué une 2e fois dans l'outputRange, ce qui remplissait l'anneau à
  // progress² (ex: 74 % s'affichait à ~55 %).
  const strokeDashoffset = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: [arc, 0],
  })

  const getColor = (pct: number) => {
    if (pct >= 95) return theme.colors.error
    if (pct >= 80) return theme.colors.warning
    return theme.colors.blue
  }

  const color = getColor(progress)

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={color} stopOpacity="1" />
            <Stop offset="100%" stopColor={progress < 80 ? theme.colors.lime : color} stopOpacity="1" />
          </LinearGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.colors.border}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />

        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#progressGrad)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeOpacity={progress === 0 ? 0 : 1}
          strokeDasharray={`${arc} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(135 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View style={styles.center}>
        {showPercentage && (
          <Text style={[styles.percentage, { color: theme.colors.navy }]}>
            {progress}%
          </Text>
        )}
        {label && <Text style={styles.label}>{label}</Text>}
        {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentage: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: theme.typography.size['4xl'],
    letterSpacing: -1,
  },
  label: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: theme.typography.size.sm,
    color: theme.colors.textMid,
    marginTop: 2,
  },
  sublabel: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.size.xs,
    color: theme.colors.textLight,
    marginTop: 2,
  },
})
