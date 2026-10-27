import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import Sheet from '../ds/Sheet'
import ChoiceRow from '../ds/ChoiceRow'
import PillButton from '../ds/PillButton'
import { subscriptionApi } from '../../lib/subscriptionApi'
import { ds, typography } from '../../lib/theme'

// « Modifier la fréquence » (maquette P09) : tous les 1, 2, 3 ou 6 mois.

const VALUES = [1, 2, 3, 6]

type Props = { contractId: string; current: number | null; onClose: () => void; onSaved: () => void }

export default function FrequencySheet({ contractId, current, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(current ?? 6)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (selected === current) return onClose()
    setSaving(true)
    setError(null)
    try {
      await subscriptionApi.updateFrequency(contractId, selected)
      onSaved()
    } catch (e: any) {
      setError(e?.message && e.message !== 'session' ? e.message : t('care:errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      title={t('subscription:freqSheetTitle')}
      onClose={onClose}
      footer={<>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PillButton label={t('subscription:confirm')} loading={saving} onPress={save} />
      </>}
    >
      {VALUES.map((v) => (
        <ChoiceRow
          key={v}
          label={t('subscription:frequency_month', { count: v })}
          selected={selected === v}
          onPress={() => setSelected(v)}
        />
      ))}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  error: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center', marginBottom: 6 },
})
