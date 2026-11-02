/** Íconos simples de trazo para la navegación (heredan el color del texto). */
export function TabIcon({ id }: { id: 'gastos' | 'tarjetas' | 'ahorros' }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'tab-icon',
  }
  if (id === 'tarjetas')
    return (
      <svg {...common}>
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
        <path d="M3 10h18M7 15h4" />
      </svg>
    )
  if (id === 'ahorros')
    return (
      <svg {...common}>
        <path d="M4 18V11M10 18V7M16 18v-5M22 18H2" />
        <path d="M14 4l2.5 2.5L22 3" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  )
}
