import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import Sheet from '../ds/Sheet'
import PillButton from '../ds/PillButton'
import { ds, typography } from '../../lib/theme'
import { subscriptionApi } from '../../lib/subscriptionApi'

// Confirmation avant la pause (maquette P40). Avant, la pause partait au premier tap.

type Props = { contractId: string; source: string; onClose: () => void; onPaused: () => void }

export default function PauseSheet({ contractId, source, onClose, onPaused }: Props) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pause = async () => {
    setSaving(true)
    setError(null)
    try {
      await subscriptionApi.pause(contractId, source)
      onPaused()
    } catch {
      setError(t('care:errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      title={t('care:pause.title')}
      message={t('care:pause.body')}
      onClose={onClose}
      footer={<>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PillButton label={t('care:pause.confirm')} loading={saving} onPress={pause} />
        <PillButton variant="quiet" label={t('care:pause.back')} onPress={onClose} />
      </>}
    />
  )
}

const styles = StyleSheet.create({
  error: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center', marginBottom: 6 },
})
