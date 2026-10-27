import { useMemo, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import Sheet from '../ds/Sheet'
import ChoiceRow from '../ds/ChoiceRow'
import PillButton from '../ds/PillButton'
import { ds, typography } from '../../lib/theme'
import { formatDate, formatDateShort } from '../../lib/i18n/format'
import { addDays, addMonths, toLocalISODate } from '../../lib/dates'
import { subscriptionApi } from '../../lib/subscriptionApi'

// « Décaler la livraison » (maquette P31) : recevoir maintenant, décaler de
// 2 semaines / 1 mois / 2 mois, ou sauter la livraison.
// Les choix qui prélèvent ou suppriment une livraison demandent une confirmation.

type Option = 'now' | 'w2' | 'm1' | 'm2' | 'skip'
export type RescheduleOutcome =
  | { kind: 'now' }
  | { kind: 'moved'; date: string }
  | { kind: 'skipped' }

type Props = {
  contractId: string
  /** Livraisons à venir (Appstle top-orders), la première est celle qu'on décale. */
  upcoming: any[]
  /** Montant prélevé, déjà formaté (affiché avant « Recevoir maintenant »). */
  price: string
  /** Choix présélectionné (ex. « m1 » depuis le parcours d'annulation). */
  initial?: Option
  onClose: () => void
  onDone: (outcome: RescheduleOutcome) => void
}

export default function RescheduleSheet({ contractId, upcoming, price, initial = 'm1', onClose, onDone }: Props) {
  const { t } = useTranslation()
  const next = upcoming[0]
  const base = useMemo(() => new Date(next?.billingDate ?? Date.now()), [next])

  const [choice, setChoice] = useState<Option>(initial)
  const [step, setStep] = useState<'choose' | 'confirmNow' | 'confirmSkip'>('choose')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targets: Record<'w2' | 'm1' | 'm2', Date> = {
    w2: addDays(base, 14),
    m1: addMonths(base, 1),
    m2: addMonths(base, 2),
  }
  const afterSkip = upcoming[1]?.billingDate ? new Date(upcoming[1].billingDate) : null

  const run = async (action: () => Promise<unknown>, outcome: RescheduleOutcome) => {
    setSaving(true)
    setError(null)
    try {
      await action()
      onDone(outcome)
    } catch {
      setError(t('care:errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  const confirmChoice = () => {
    if (!next) return
    if (choice === 'now') return setStep('confirmNow')
    if (choice === 'skip') return setStep('confirmSkip')
    const iso = toLocalISODate(targets[choice])
    run(() => subscriptionApi.reschedule(contractId, String(next.id), iso), { kind: 'moved', date: iso })
  }

  if (step === 'confirmNow') {
    return (
      <Sheet
        title={t('care:reschedule.nowTitle')}
        message={t('care:reschedule.nowBody', { price })}
        onClose={onClose}
        footer={<>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PillButton label={t('care:reschedule.nowCta', { price })} loading={saving}
            onPress={() => run(() => subscriptionApi.orderNow(contractId, String(next.id)), { kind: 'now' })} />
          <PillButton variant="quiet" label={t('common:back')} onPress={() => { setError(null); setStep('choose') }} />
        </>}
      />
    )
  }

  if (step === 'confirmSkip') {
    return (
      <Sheet
        title={t('care:reschedule.skipTitle')}
        message={t('care:reschedule.skipBody', { date: formatDate(base) })}
        onClose={onClose}
        footer={<>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PillButton label={t('care:reschedule.skipCta')} loading={saving}
            onPress={() => run(() => subscriptionApi.skip(contractId, String(next.id)), { kind: 'skipped' })} />
          <PillButton variant="quiet" label={t('common:back')} onPress={() => { setError(null); setStep('choose') }} />
        </>}
      />
    )
  }

  return (
    <Sheet
      title={t('care:reschedule.title')}
      subtitle={next ? t('care:reschedule.plannedOn', { date: formatDate(base) }) : t('care:nextOrder.none')}
      note={next ? t('care:reschedule.warning') : undefined}
      onClose={onClose}
      footer={next ? <>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PillButton label={t('care:reschedule.confirm')} loading={saving} onPress={confirmChoice} />
      </> : undefined}
    >
      {next ? <>
        <ChoiceRow label={t('care:reschedule.now')} selected={choice === 'now'} onPress={() => setChoice('now')} />
        <ChoiceRow label={t('care:reschedule.in2Weeks')} detail={formatDateShort(targets.w2)} selected={choice === 'w2'} onPress={() => setChoice('w2')} />
        <ChoiceRow label={t('care:reschedule.in1Month')} detail={formatDateShort(targets.m1)} selected={choice === 'm1'} onPress={() => setChoice('m1')} />
        <ChoiceRow label={t('care:reschedule.in2Months')} detail={formatDateShort(targets.m2)} selected={choice === 'm2'} onPress={() => setChoice('m2')} />
        <ChoiceRow
          label={t('care:reschedule.skip')}
          detail={afterSkip ? formatDateShort(afterSkip) : undefined}
          selected={choice === 'skip'}
          onPress={() => setChoice('skip')}
        />
      </> : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  error: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: ds.red, textAlign: 'center', marginBottom: 6 },
})
