/**
 * Genera powerbi/sample-data/{gastos,categorias}.csv con los mismos datos de
 * ejemplo que la app, para poder armar el reporte de Power BI sin cargar nada.
 *   npm run sample:powerbi
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { generateDemoExpenses } from '../src/lib/demo'
import { CATEGORIES } from '../src/lib/categories'
import { categoriesToCsv, expensesToCsv } from '../src/lib/csv'

const end = process.argv[2] ?? '2026-10' // último mes (YYYY-MM)
const months = Number(process.argv[3] ?? 12)
const dir = new URL('../powerbi/sample-data/', import.meta.url)
mkdirSync(dir, { recursive: true })

const expenses = generateDemoExpenses(end, months)
writeFileSync(new URL('gastos.csv', dir), '﻿' + expensesToCsv(expenses))
writeFileSync(new URL('categorias.csv', dir), '﻿' + categoriesToCsv(CATEGORIES))
console.log(`OK: ${expenses.length} gastos (${months} meses hasta ${end}) → powerbi/sample-data/`)
