# Reporte de Power BI — Cuentas Claras

La app exporta un **modelo estrella** listo para Power BI:

| Archivo | Rol | Columnas |
|---|---|---|
| `gastos.csv` | Tabla de hechos (1 fila = 1 gasto en el mes en que se paga; las compras en cuotas, 1 fila por cuota) | `id, fecha, monto, categoria_id, descripcion, medio_pago, moneda, monto_original, tarjeta_id, cuotas, mes, vencimiento, cuota, monto_total` |
| `categorias.csv` | Dimensión | `categoria_id, categoria, emoji, tipo` (`fijo` / `variable`) |

Los gastos se imputan igual que en la pantalla Gastos de la app:

- **Crédito con tarjeta** → al mes en que **vence el resumen** donde cae. Ej.: compra del 21/10 con una tarjeta que cierra el 29 y vence el 11 → resumen que vence el 11/11 → `mes = 2026-11-01`.
- **Cuotas** → una fila por cuota, cada una en el mes de su resumen (sin tarjeta: una por mes desde la compra).
- **El resto** (efectivo, débito, transferencia, crédito sin tarjeta) → al mes de la compra.

Columnas:

- `fecha`: el día de la compra.
- `mes`: el primer día del mes imputado. **Es la fecha que hay que usar para los totales por mes.**
- `vencimiento`: sólo en crédito con tarjeta.
- `monto`: lo que se imputa a ese mes. Si es una cuota, el monto de la cuota.
- `monto_total`: la compra entera.
- `cuotas`: cuántas tiene la compra (1 si fue en un pago).
- `cuota`: el número de esta fila. La clave única es `id` + `cuota`.

`monto` siempre está en pesos (los gastos en dólares se convierten con la cotización que cargaste); `monto_original` tiene los USD.

Formato: UTF‑8, separador coma, decimales con punto y fechas ISO (`2026-10-31`). Así Power Query no depende de la configuración regional de la PC.

> ¿No tenés datos todavía? En `sample-data/` hay 12 meses de ejemplo (`npm run sample:powerbi` los regenera).

---

## 1. Importar con Power Query

1. **Inicio → Transformar datos → Administrar parámetros → Nuevo**: `CarpetaDatos`, tipo Texto, valor = la carpeta donde guardás los CSV **terminada en `\`** (ej. `C:\Users\lu\Documents\cuentas-claras\`).
2. **Nuevo origen → Consulta en blanco → Editor avanzado**, pegá cada consulta:

**Gastos**

```m
let
    Origen = Csv.Document(
        File.Contents(CarpetaDatos & "gastos.csv"),
        [Delimiter = ",", Columns = 14, Encoding = 65001, QuoteStyle = QuoteStyle.Csv]
    ),
    Encabezados = Table.PromoteHeaders(Origen, [PromoteAllScalars = true]),
    // Las celdas vacías de monto_original / tarjeta_id / vencimiento pasan a null antes de tipar
    Vacios = Table.ReplaceValue(Encabezados, "", null, Replacer.ReplaceValue, {"monto_original", "tarjeta_id", "vencimiento"}),
    Tipos = Table.TransformColumnTypes(
        Vacios,
        {
            {"id", type text}, {"fecha", type date}, {"monto", type number},
            {"categoria_id", type text}, {"descripcion", type text}, {"medio_pago", type text},
            {"moneda", type text}, {"monto_original", type number}, {"tarjeta_id", type text},
            {"cuotas", Int64.Type}, {"mes", type date}, {"vencimiento", type date},
            {"cuota", Int64.Type}, {"monto_total", type number}
        },
        "en-US"   // fechas ISO y punto decimal, sin importar el idioma de Windows
    ),
    MedioPago = Table.AddColumn(
        Tipos, "Medio de pago",
        each Record.FieldOrDefault(
            [debito = "Débito", credito = "Crédito", transferencia = "Transferencia", efectivo = "Efectivo"],
            [medio_pago], [medio_pago]
        ),
        type text
    ),
    SinDescripcionVacia = Table.ReplaceValue(MedioPago, "", "(sin descripción)", Replacer.ReplaceValue, {"descripcion"})
in
    SinDescripcionVacia
```

**Categorias**

```m
let
    Origen = Csv.Document(
        File.Contents(CarpetaDatos & "categorias.csv"),
        [Delimiter = ",", Columns = 4, Encoding = 65001, QuoteStyle = QuoteStyle.Csv]
    ),
    Encabezados = Table.PromoteHeaders(Origen, [PromoteAllScalars = true]),
    Tipos = Table.TransformColumnTypes(Encabezados, {{"categoria_id", type text}, {"categoria", type text}, {"emoji", type text}, {"tipo", type text}}),
    Etiqueta = Table.AddColumn(Tipos, "Categoría", each [emoji] & " " & [categoria], type text),
    Tipo = Table.TransformColumns(Etiqueta, {{"tipo", Text.Proper, type text}})
in
    Tipo
```

> Tip: si querés ir sumando exportaciones mes a mes, cambiá `File.Contents` por `Folder.Files(CarpetaDatos)` filtrando los `gastos*.csv` y combinándolos (quitando duplicados por `id` + `cuota`).

---

## 2. Modelo

**Tabla calendario** (Modelado → Nueva tabla):

```dax
Calendario =
VAR _min = DATE ( YEAR ( MIN ( Gastos[fecha] ) ), 1, 1 )
VAR _max = DATE ( YEAR ( MAX ( Gastos[mes] ) ), 12, 31 )   -- las cuotas llegan a meses futuros
RETURN
    ADDCOLUMNS (
        CALENDAR ( _min, _max ),
        "Año", YEAR ( [Date] ),
        "Mes Num", MONTH ( [Date] ),
        "Año Mes", YEAR ( [Date] ) * 100 + MONTH ( [Date] ),
        "Mes", FORMAT ( [Date], "mmm yy" ),
        "Día semana", FORMAT ( [Date], "dddd" ),
        "Día semana Num", WEEKDAY ( [Date], 2 )
    )
```

- Marcala como **tabla de fechas** (columna `Date`).
- Ordená `Mes` por `Año Mes` y `Día semana` por `Día semana Num`.
- Para que los meses salgan en castellano: **Archivo → Opciones → Configuración regional → Español (Argentina)**.

**Relaciones** (1 → *, dirección simple):

```
Calendario[Date]          1 ──── * Gastos[mes]            (activa: mes en que se paga, como la app)
Calendario[Date]          1 ┄┄┄┄ * Gastos[fecha]          (inactiva: día de la compra, para "Hábitos")
Categorias[categoria_id]  1 ──── * Gastos[categoria_id]
```

`mes` es siempre el día 1, así que la relación activa sirve para meses y años, no para días de la semana. Para eso está la relación inactiva con `fecha` y la medida `Gastos por Fecha de Compra`.

Ocultá en la vista de informe las columnas técnicas (`id`, `cuota`, `categoria_id`, `medio_pago`, `emoji`) para que el panel de campos quede limpio.

---

## 3. Medidas DAX

Creá una tabla vacía `_Medidas` (Inicio → Especificar datos → Cargar) para agruparlas.

```dax
Total Gastos = SUM ( Gastos[monto] )

-- Mismo total, pero por el día de la compra (usa la relación inactiva con Gastos[fecha])
Gastos por Fecha de Compra =
CALCULATE ( [Total Gastos], USERELATIONSHIP ( Calendario[Date], Gastos[fecha] ) )

Cant. Gastos = COUNTROWS ( Gastos )

Ticket Promedio = DIVIDE ( [Total Gastos], [Cant. Gastos] )

Gastos Mes Anterior =
CALCULATE ( [Total Gastos], DATEADD ( Calendario[Date], -1, MONTH ) )

Var % vs Mes Anterior =
DIVIDE ( [Total Gastos] - [Gastos Mes Anterior], [Gastos Mes Anterior] )

% del Total =
DIVIDE ( [Total Gastos], CALCULATE ( [Total Gastos], REMOVEFILTERS ( Categorias ) ) )

Gastos Acumulado Año = TOTALYTD ( [Total Gastos], Calendario[Date] )

Promedio Mensual 12m =
CALCULATE (
    AVERAGEX ( VALUES ( Calendario[Año Mes] ), [Total Gastos] ),
    DATESINPERIOD ( Calendario[Date], MAX ( Calendario[Date] ), -12, MONTH )
)

-- En el mes en curso divide por los días transcurridos (igual que la app)
Promedio Diario =
VAR _dias = COUNTROWS ( FILTER ( Calendario, Calendario[Date] <= TODAY () ) )
RETURN
    DIVIDE ( [Total Gastos], _dias )

Gastos en USD = CALCULATE ( SUM ( Gastos[monto_original] ), Gastos[moneda] = "USD" )

Gastos Fijos = CALCULATE ( [Total Gastos], Categorias[tipo] = "Fijo" )

% Fijos = DIVIDE ( [Gastos Fijos], [Total Gastos] )

Categoría Principal =
VAR _top = TOPN ( 1, VALUES ( Categorias[Categoría] ), [Total Gastos] )
RETURN CONCATENATEX ( _top, Categorias[Categoría], ", " )

Ranking Categoría =
IF (
    NOT ISBLANK ( [Total Gastos] ),
    RANKX ( ALLSELECTED ( Categorias[Categoría] ), [Total Gastos],, DESC, DENSE )
)

-- Para formato condicional (Formato → Color de fuente → Valor del campo)
Color Variación =
SWITCH (
    TRUE (),
    ISBLANK ( [Var % vs Mes Anterior] ), "#7A7873",
    [Var % vs Mes Anterior] > 0.005, "#B42F2F",   -- gastaste más
    [Var % vs Mes Anterior] < -0.005, "#006300",  -- gastaste menos
    "#7A7873"
)

Texto Variación =
VAR _v = [Var % vs Mes Anterior]
RETURN
    IF (
        ISBLANK ( _v ), "Sin mes anterior para comparar",
        IF ( _v > 0, "▲ ", "▼ " ) & FORMAT ( ABS ( _v ), "0%" )
            & IF ( _v > 0, " más", " menos" ) & " que el mes anterior"
    )

Título Página =
"Gastos de " & FORMAT ( MAX ( Calendario[Date] ), "mmmm yyyy" )
```

Formatos: `Total Gastos`, `Gastos *`, `Promedio *`, `Ticket Promedio` → moneda `$ #,0`; los `%` → porcentaje sin decimales.

---

## 4. Páginas sugeridas

### Resumen (la respuesta a "¿en qué se me va la plata?")
- **Segmentador** de `Calendario[Mes]` (lista desplegable, selección única) arriba a la derecha.
- **Tarjetas**: `Total Gastos` (+ `Texto Variación` debajo, color con `Color Variación`), `Promedio Diario`, `Categoría Principal`, `% Fijos`.
- **Barras horizontales**: eje `Categorias[Categoría]`, valor `Total Gastos`, orden descendente, un solo color, etiquetas de datos activadas. Tooltip con `% del Total` y `Var % vs Mes Anterior`.
- **Columnas por mes**: eje `Calendario[Mes]`, valor `Total Gastos`, con un filtro de nivel visual de *últimos 12 meses* y una **línea de promedio** desde el panel de Análisis. Editá interacciones para que el segmentador de mes **resalte** (no filtre) este gráfico.

### Tendencias
- **Matriz** filas `Categoría`, columnas `Mes`, valor `Total Gastos` con **escala de colores** (fondo, un solo tono azul de claro a oscuro). Es el "mapa de calor" que muestra qué categoría se dispara en qué mes.
- **Gráfico de líneas** `Total Gastos` por mes con **pequeños múltiplos** por `Categorias[tipo]`.

### Hábitos
- **Columnas** por `Calendario[Día semana]` con `Gastos por Fecha de Compra` → ¿qué días gasto más?
- **Barras** por `Gastos[Medio de pago]`.
- **Árbol de descomposición**: `Total Gastos` → `tipo` → `Categoría` → `descripcion`.

---

## 5. Tema

`tema-cuentas-claras.json` usa la misma paleta que la app. **Vista → Temas → Buscar temas** y elegí el archivo.

---

## 6. Para el porfolio

Publicar en la web con *Publish to web* expone los datos públicamente: hacelo **sólo con los datos de ejemplo**. Alternativa más segura: subir el `.pbix` al repo (con `sample-data`) + capturas en el README.
