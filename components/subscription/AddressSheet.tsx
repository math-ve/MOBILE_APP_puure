import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Sheet from '../ds/Sheet'
import PillButton from '../ds/PillButton'
import { Field } from '../ds/Field'
import { subscriptionApi } from '../../lib/subscriptionApi'
import { ds, typography } from '../../lib/theme'

// « Modifier l'adresse » (maquette P18). Le pays, la région et le téléphone ne
// sont pas affichés : ils sont repris tels quels de l'adresse actuelle.

const COUNTRY_CODES: Record<string, string> = {
  france: 'FR', belgium: 'BE', belgique: 'BE', netherlands: 'NL', 'pays-bas': 'NL',
  germany: 'DE', allemagne: 'DE', spain: 'ES', espagne: 'ES', italy: 'IT', italie: 'IT',
  'united kingdom': 'GB', 'royaume-uni': 'GB', uk: 'GB', luxembourg: 'LU',
  switzerland: 'CH', suisse: 'CH', portugal: 'PT', austria: 'AT', autriche: 'AT',
}

type Fields = { firstName: string; lastName: string; address1: string; address2: string; zip: string; city: string }

type Props = { contractId: string; initial: any; onClose: () => void; onSaved: (address: any) => void }

export default function AddressSheet({ contractId, initial, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const [f, setF] = useState<Fields>({
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    address1: initial?.address1 ?? '',
    address2: initial?.address2 ?? '',
    zip: initial?.zip ?? '',
    city: initial?.city ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof Fields) => (v: string) => setF((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    const trimmed = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])) as Fields
    if (!trimmed.firstName || !trimmed.lastName || !trimmed.address1 || !trimmed.zip || !trimmed.city) {
      setError(t('subscription:missingFieldsShort'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const country = initial?.country ?? null
      const address = {
        ...trimmed,
        address2: trimmed.address2 || null,
        country,
        countryCode: initial?.countryCode ?? COUNTRY_CODES[(country ?? '').toLowerCase().trim()] ?? null,
        province: initial?.province ?? null,
        provinceCode: initial?.provinceCode ?? null,
        phone: initial?.phone ?? null,
        company: initial?.company ?? null,
      }
      // Le serveur renvoie déjà le message lisible d'Appstle (adresse refusée…).
      await subscriptionApi.updateAddress(contractId, address)
      onSaved(address)
    } catch (e: any) {
      setError(e?.message && e.message !== 'session' ? e.message : t('subscription:updateError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      title={t('subscription:addressSheetTitle')}
      onClose={onClose}
      footer={<>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PillButton label={t('subscription:save')} loading={saving} onPress={save} />
      </>}
    >
      <View style={styles.form}>
        <View style={styles.row}>
          <Field style={styles.half} label={t('subscription:dsFirstName')} value={f.firstName} onChangeText={set('firstName')} autoComplete="given-name" textContentType="givenName" />
          <Field style={styles.half} label={t('subscription:dsLastName')} value={f.lastName} onChangeText={set('lastName')} autoComplete="family-name" textContentType="familyName" />
        </View>
        <Field label={t('subscription:dsAddress')} value={f.address1} onChangeText={set('address1')} autoComplete="street-address" textContentType="streetAddressLine1" />
        <Field label={t('subscription:dsAddress2')} value={f.address2} onChangeText={set('address2')} placeholder={t('subscription:phAddress2Ds')} textContentType="streetAddressLine2" />
        <View style={styles.row}>
          <Field style={styles.zip} label={t('subscription:dsZip')} value={f.zip} onChangeText={set('zip')} autoComplete="postal-code" textContentType="postalCode" />
          <Field style={styles.city} label={t('subscription:dsCity')} value={f.city} onChangeText={set('city')} textContentType="addressCity" />
        </View>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  zip: { flex: 4 },
  city: { flex: 7 },
  error: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center', marginBottom: 6 },
})
