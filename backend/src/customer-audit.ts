import { readDatabaseConfig } from './config.js'
import { createDatabase } from './database.js'

const database = createDatabase(readDatabaseConfig())
try {
  const [owners, members, quantities, mismatches] = await Promise.all([
    database.client.$queryRaw`SELECT customerId, COUNT(*) AS assets, SUM(appraisal) AS appraisal, SUM(appraisal IS NULL) AS unappraised FROM assets GROUP BY customerId ORDER BY customerId`,
    database.client.$queryRaw`SELECT customerId, status, COUNT(*) AS members FROM users WHERE role = 'CUSTOMER' GROUP BY customerId, status ORDER BY customerId`,
    database.client.$queryRaw`SELECT customerId, unit, SUM(quantity) AS quantity FROM assets GROUP BY customerId, unit ORDER BY customerId, unit`,
    database.client.$queryRaw`SELECT asset.id, asset.customerId, receiving.customerId AS receivingCustomerId, inspected.customerId AS inspectionCustomerId FROM assets asset LEFT JOIN receivings receiving ON receiving.id = asset.receivingId LEFT JOIN inspection_items item ON item.assetId = asset.id LEFT JOIN inspections inspection ON inspection.id = item.inspectionId LEFT JOIN receivings inspected ON inspected.id = inspection.receivingId WHERE (receiving.id IS NOT NULL AND asset.customerId <> receiving.customerId) OR (inspected.id IS NOT NULL AND asset.customerId <> inspected.customerId)`,
  ])
  console.info(JSON.stringify({ generatedAt: new Date().toISOString(), owners, members, quantities, mismatches }, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value, 2))
} finally {
  await database.close()
}