interface Props {
  onGoogle: () => void
  onGuest: () => void
  error: string | null
}

export function LoginScreen({ onGoogle, onGuest, error }: Props) {
  return (
    <div className="login">
      <div className="login-card">
        <span className="logo lg" aria-hidden>$</span>
        <h1>Cuentas Claras</h1>
        <p className="login-lead">Registrá tus gastos y mirá a dónde se va la plata, mes a mes.</p>

        <ul className="login-points">
          <li>Tus datos se guardan en tu cuenta y los ves desde cualquier dispositivo.</li>
          <li>Comparativas entre meses y por categoría.</li>
          <li>Exportás a Power BI cuando quieras.</li>
        </ul>

        <button className="btn google" onClick={onGoogle}>
          Continuar con Google
        </button>
        {error && (
          <p className="form-error" role="alert">
            No se pudo iniciar sesión: {error}
          </p>
        )}
        <button className="link" onClick={onGuest}>
          Probar sin cuenta (los datos quedan sólo en este navegador)
        </button>
      </div>
    </div>
  )
}
