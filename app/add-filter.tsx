import { useEffect, useState } from 'react'
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import Svg, { Path } from 'react-native-svg'
import { FlowScreen } from '../components/ds/Flow'
import { Field, FieldLabel } from '../components/ds/Field'
import PillButton from '../components/ds/PillButton'
import Sheet from '../components/ds/Sheet'
import Glyph from '../components/ds/Glyph'
import { SYSTEMS } from '../components/water/SystemsRow'
import { addFilter, FilterType } from '../lib/water'
import { supabase } from '../lib/supabase'
import i18n from '../lib/i18n'
import { formatDate } from '../lib/i18n/format'
import { ds, typography } from '../lib/theme'
import { useToast } from '../hooks/useToast'

// « Ajouter un filtre » (maquette P07).

const LIFESPAN_MIN = 30
const LIFESPAN_MAX = 365
const LIFESPAN_STEP = 15

export default function AddFilterScreen() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const params = useLocalSearchParams<{ type?: FilterType }>()
  const [name, setName] = useState('')
  const [type, setType] = useState<FilterType>(params.type ?? 'robinet')
  const [location, setLocation] = useState('')
  const [installedAt, setInstalledAt] = useState(new Date())
  const [lifespan, setLifespan] = useState(90)
  const [dateSheet, setDateSheet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  // Image carrée en points (voir SystemsRow : aspectRatio s'étire sur iPhone).
  const [typesWidth, setTypesWidth] = useState(0)
  const typeSide = typesWidth > 0 ? Math.floor((typesWidth - 16) / 3) : 0

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)) }, [])

  const pickDate = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: installedAt, mode: 'date', maximumDate: new Date(), onChange: (_, d) => { if (d) setInstalledAt(d) } })
    } else setDateSheet(true)
  }

  const save = async () => {
    if (!name.trim()) return setError(t('water:add.nameRequired'))
    if (!userId) return
    setSaving(true)
    setError(null)
    try {
      await addFilter(userId, { name, type, location, lifespanDays: lifespan, installedAt })
      showToast(t('water:add.done'), 'success')
      router.back()
    } catch {
      setError(t('care:errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FlowScreen
      title={t('water:add.header')}
      onBack={() => router.back()}
      actions={<>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PillButton label={t('water:add.save')} loading={saving} onPress={save} />
        <PillButton variant="quiet" label={t('common:cancel')} onPress={() => router.back()} />
      </>}
    >
      <Field label={t('water:add.name')} value={name} onChangeText={setName} placeholder={t('water:add.namePlaceholder')} returnKeyType="next" />

      <View style={{ gap: 8 }}>
        <FieldLabel>{t('water:add.type')}</FieldLabel>
        <View style={styles.types} onLayout={(e) => setTypesWidth(e.nativeEvent.layout.width)}>
          {SYSTEMS.map((s) => {
            const on = type === s.type
            return (
              <Pressable
                key={s.type}
                onPress={() => setType(s.type)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.typeCard, on && styles.typeCardOn]}
              >
                <Image source={s.image} style={[styles.typeImage, { height: typeSide }]} resizeMode="cover" />
                <Text style={styles.typeLabel}>{t(`water:systems.${s.type}`)}</Text>
                {on && (
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
      </View>

      <Field label={t('water:add.location')} value={location} onChangeText={setLocation} placeholder={t('water:add.locationPlaceholder')} />

      <View style={styles.twoCols}>
        <View style={{ flex: 1, gap: 8 }}>
          <FieldLabel>{t('water:add.installedOn')}</FieldLabel>
          <Pressable onPress={pickDate} style={styles.dateBtn} accessibilityRole="button">
            <Text style={styles.dateText}>{formatDate(installedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
            <Glyph name="calendar" size={18} color={ds.blue} />
          </Pressable>
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <FieldLabel>{t('water:add.lifespan')}</FieldLabel>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => setLifespan((v) => Math.max(LIFESPAN_MIN, v - LIFESPAN_STEP))}
              style={styles.stepBtn}
              accessibilityRole="button"
              accessibilityLabel={t('water:add.decrease')}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="M5 12h14" stroke={ds.blue} strokeWidth={2} strokeLinecap="round" /></Svg>
            </Pressable>
            <Text style={styles.stepValue}>{t('water:add.lifespanValue', { count: lifespan })}</Text>
            <Pressable
              onPress={() => setLifespan((v) => Math.min(LIFESPAN_MAX, v + LIFESPAN_STEP))}
              style={styles.stepBtn}
              accessibilityRole="button"
              accessibilityLabel={t('water:add.increase')}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="M12 5v14M5 12h14" stroke={ds.blue} strokeWidth={2} strokeLinecap="round" /></Svg>
            </Pressable>
          </View>
        </View>
      </View>

      {dateSheet && (
        <Sheet
          title={t('water:add.installedOn')}
          onClose={() => setDateSheet(false)}
          footer={<PillButton label={t('common:confirm')} onPress={() => setDateSheet(false)} />}
        >
          <DateTimePicker
            value={installedAt}
            mode="date"
            display="inline"
            maximumDate={new Date()}
            accentColor={ds.blue}
            locale={i18n.language}
            onChange={(_, d) => { if (d) setInstalledAt(d) }}
          />
        </Sheet>
      )}
    </FlowScreen>
  )
}

const styles = StyleSheet.create({
  types: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  typeCard: { flex: 1, minWidth: 0, borderRadius: 20, borderWidth: 1, borderColor: ds.line, backgroundColor: ds.raised, overflow: 'hidden' },
  typeCardOn: { borderWidth: 2, borderColor: ds.blue },
  typeImage: { width: '100%' },
  typeLabel: { paddingVertical: 10, paddingHorizontal: 12, fontFamily: typography.fontFamily.medium, fontSize: 15, color: ds.ink, textAlign: 'center' },
  check: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: ds.blue, alignItems: 'center', justifyContent: 'center' },
  twoCols: { flexDirection: 'row', gap: 10 },
  dateBtn: {
    height: 52, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: ds.line, backgroundColor: ds.raised,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dateText: { fontFamily: typography.fontFamily.regular, fontSize: 16, color: ds.ink },
  stepper: {
    height: 52, paddingHorizontal: 4, borderRadius: 999, borderWidth: 1, borderColor: ds.line, backgroundColor: ds.raised,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: ds.fill, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontFamily: typography.fontFamily.medium, fontSize: 16, color: ds.ink },
  error: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center', marginBottom: 6 },
})
