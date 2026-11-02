import type { StatementSummary } from '../lib/cards'
import { formatARS, formatUSD } from '../lib/format'

interface Props {
  alerts: StatementSummary[]
  onOpenCards: () => void
}

/** Avisos arriba de todo cuando se acerca el vencimiento de una tarjeta. */
export function CardAlerts({ alerts, onOpenCards }: Props) {
  if (!alerts.length) return null
  return (
    <div className="alerts" role="region" aria-label="Vencimientos de tarjetas">
      {alerts.map(({ card, cycle, usd, ars }) => {
        const when = cycle.daysToDue === 0 ? 'hoy' : cycle.daysToDue === 1 ? 'mañana' : `en ${cycle.daysToDue} días`
        return (
          <div key={card.id} className="alert">
            <span className="alert-icon" aria-hidden>⚠</span>
            <div className="alert-body">
              <strong>
                {card.name} vence {when}
              </strong>
              <span>
                {usd > 0 ? (
                  <>
                    Tenés <b>{formatUSD(usd)}</b> en consumos en dólares
                    {card.autoDebit ? ': pagalos con dólares antes del débito automático.' : '.'}
                    {ars > 0 && <> En pesos: {formatARS(ars)}.</>}
                  </>
                ) : (
                  <>Resumen de {formatARS(ars)}{card.autoDebit ? ', se debita solo.' : '. Acordate de pagarlo.'}</>
                )}
              </span>
            </div>
            <button className="btn small" onClick={onOpenCards}>Ver detalle</button>
          </div>
        )
      })}
    </div>
  )
}
