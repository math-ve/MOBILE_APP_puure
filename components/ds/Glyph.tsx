import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { ds } from '../../lib/theme'

// Pictogrammes au trait (24 × 24, trait 1,8) des nouveaux parcours.

export type GlyphName =
  | 'back' | 'check' | 'pause' | 'play' | 'card' | 'camera' | 'image' | 'alert'
  | 'box' | 'calendar' | 'mail' | 'chevron' | 'close' | 'home' | 'drop' | 'alertCircle'

type Props = { name: GlyphName; size?: number; color?: string }

export default function Glyph({ name, size = 22, color = ds.ink }: Props) {
  const p = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'back' && <><Path d="M19 12H5" {...p} /><Path d="M12 19l-7-7 7-7" {...p} /></>}
      {name === 'chevron' && <Path d="M9 5l7 7-7 7" {...p} />}
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
      {name === 'pause' && <><Path d="M9 6v12M15 6v12" {...p} /></>}
      {name === 'play' && <Path d="M8 5.5v13l10-6.5-10-6.5z" {...p} />}
      {name === 'card' && <><Rect x={3} y={5.5} width={18} height={13} rx={2.5} {...p} /><Path d="M3 10h18M7 15h3" {...p} /></>}
      {name === 'camera' && <><Path d="M4 8.5A1.5 1.5 0 015.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0120 8.5V17a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17V8.5z" {...p} /><Circle cx={12} cy={12.5} r={3.2} {...p} /></>}
      {name === 'image' && <><Rect x={3.5} y={4.5} width={17} height={15} rx={2.5} {...p} /><Circle cx={9} cy={10} r={1.6} {...p} /><Path d="M20.5 16l-5-5-8.5 8.5" {...p} /></>}
      {name === 'alert' && <><Path d="M12 4l9 15.5H3L12 4z" {...p} /><Path d="M12 10v4M12 17h.01" {...p} /></>}
      {name === 'box' && <><Path d="M21 8l-9-5-9 5 9 5 9-5z" {...p} /><Path d="M3 8v8l9 5 9-5V8" {...p} /><Path d="M12 13v8" {...p} /></>}
      {name === 'calendar' && <><Rect x={3} y={5} width={18} height={16} rx={3} {...p} /><Path d="M3 10h18M8 3v4M16 3v4" {...p} /></>}
      {name === 'mail' && <><Rect x={3.5} y={5.5} width={17} height={13} rx={2.5} {...p} /><Path d="M4 7l8 6 8-6" {...p} /></>}
      {name === 'home' && <Path d="M4 11l8-6.5 8 6.5V19a1 1 0 01-1 1h-4.5v-5h-5v5H5a1 1 0 01-1-1v-8z" {...p} />}
      {name === 'alertCircle' && <><Circle cx={12} cy={12} r={9} {...p} /><Path d="M12 8v5M12 16.5v.01" {...p} /></>}
      {name === 'drop' && <Path d="M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z" {...p} />}
    </Svg>
  )
}
