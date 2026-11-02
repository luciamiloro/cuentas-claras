# Configurar login con Google y guardado en la nube

Son ~20 minutos y todo es gratis (plan Free de Supabase y Vercel). Al final:

- Entrás con tu cuenta de Google desde cualquier navegador o el celu.
- Tus gastos quedan en una base Postgres, y cada usuario ve **sólo lo suyo** (Row Level Security).
- Power BI se puede conectar directo a esa base.

Si no configurás nada de esto, la app sigue funcionando en **modo local**, sin login.

---

## 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com), **New project**. Elegí la región más cercana (São Paulo) y guardá la contraseña de la base: la vas a necesitar para Power BI.
2. **SQL Editor → New query**: pegá todo `supabase/schema.sql` y **Run**. Crea las tablas, las políticas de seguridad y las vistas para Power BI. Se puede volver a ejecutar sin perder datos (cuando actualices la app, corrélo de nuevo).
3. **Project Settings → API** (o **API Keys**): copiá la **Project URL** y la clave pública (`anon` o `publishable`). Esa clave puede ir en el front: lo que protege los datos es RLS.

> La clave `service_role` / `secret` **nunca** va en el front ni en el repo.

## 2. Credenciales de Google (Google Cloud Console)

1. [console.cloud.google.com](https://console.cloud.google.com) → creá un proyecto (ej. "Cuentas Claras").
2. **Google Auth Platform** (o *APIs y servicios → Pantalla de consentimiento de OAuth*):
   - Tipo de usuario **Externo**. Nombre de la app, tu mail de soporte y de contacto.
   - En **Data Access / Alcances** alcanza con `openid`, `email` y `profile`.
   - Mientras esté en modo *Testing*, agregá tu mail (y el de quien quieras que la pruebe) en **Test users**. Si querés que entre cualquiera, después la pasás a *In production*. Con esos alcances básicos no necesita verificación de Google.
3. **Clients → Create client → Web application**:
   - **Authorized JavaScript origins**: `http://localhost:5173` y después tu dominio de Vercel (`https://cuentas-claras-xxx.vercel.app`).
   - **Authorized redirect URIs**: la URL de callback que te muestra Supabase en *Authentication → Sign In / Providers → Google*. Tiene esta forma: `https://TU-PROYECTO.supabase.co/auth/v1/callback`.
4. Copiá el **Client ID** y el **Client secret**.

## 3. Activar Google en Supabase

1. **Authentication → Sign In / Providers → Google**: activalo y pegá el Client ID y el Client secret.
2. **Authentication → URL Configuration**:
   - **Site URL**: tu URL de producción (o `http://localhost:5173` mientras probás).
   - **Redirect URLs**: agregá `http://localhost:5173/**` y `https://TU-APP.vercel.app/**`.

## 4. Probar en local

```bash
cp .env.example .env.local   # completá URL y clave del paso 1
npm install
npm run dev
```

Abrí `http://localhost:5173`, tocá **Continuar con Google** y listo. Si antes cargaste gastos en modo invitado, la app te ofrece subirlos a tu cuenta.

## 5. Deploy en Vercel

1. Subí el repo a GitHub (`.env.local` está en `.gitignore`, no se sube).
2. [vercel.com/new](https://vercel.com/new) → importá el repo. Vercel detecta Vite solo.
3. **Settings → Environment Variables**: cargá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, y hacé **Redeploy**.
4. Agregá la URL de Vercel en los dos lugares que quedaron pendientes: *Authorized JavaScript origins* en Google y *Redirect URLs* en Supabase.

## 6. Power BI conectado directo (sin CSV)

1. En el SQL Editor creá un usuario de **sólo lectura** para Power BI:

   ```sql
   create role powerbi_reader with login password 'una-contraseña-larga';
   grant usage on schema public to powerbi_reader;
   grant select on public.bi_gastos, public.bi_ahorros, public.categories to powerbi_reader;
   ```

2. En Supabase tocá **Connect** y copiá los datos del **Session pooler**: host del tipo `aws-0-sa-east-1.pooler.supabase.com`, puerto `5432`, base `postgres`. El pooler funciona sobre IPv4, que es lo que suele tener Windows en casa.
3. Power BI Desktop → **Obtener datos → Base de datos PostgreSQL**:
   - Servidor: `HOST:5432` · Base de datos: `postgres`.
   - Usuario: `powerbi_reader.TU-REF-DE-PROYECTO` (con el pooler el usuario lleva el ref del proyecto después del punto) y la contraseña del paso 1.
   - Elegí `public.bi_gastos`, `public.bi_ahorros` y `public.categories`.
4. Las tablas ya traen los nombres `fecha`, `monto`, `categoria_id`, etc., así que el modelo y las medidas DAX de `powerbi/README.md` funcionan igual. Sólo cambiá las consultas de origen y agregá la columna `Medio de pago` y la etiqueta `Categoría` como en la guía.
5. Si la app la usa más de una persona, filtrá por `usuario` en Power Query o en el reporte.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| `redirect_uri_mismatch` en la pantalla de Google | La URL de callback de Supabase no está en *Authorized redirect URIs* |
| Vuelve a la app pero sigue en la pantalla de login | Tu URL no está en *Redirect URLs* de Supabase, o falta la barra/puerto exacto |
| "Access blocked: app not verified" o "Acceso denegado" | La app está en modo *Testing* y tu mail no está en *Test users* |
| Entra pero aparece "No pudimos traer tus gastos" | No corriste `schema.sql`, o las variables de entorno apuntan a otro proyecto |
| En Vercel no aparece el login | Faltan las variables de entorno o no hiciste Redeploy después de cargarlas |
