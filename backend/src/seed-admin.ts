import { hashPassword } from './auth.js'
import { readDatabaseConfig } from './config.js'
import { createDatabase } from './database.js'

if (process.env.NODE_ENV === 'production') throw new Error('테스트 관리자 계정은 운영 환경에 생성할 수 없습니다.')

const database = createDatabase(readDatabaseConfig())
try {
  const existing = await database.client.user.findUnique({ where: { email: 'admin' }, select: { role: true, customerId: true } })
  if (existing && (existing.role !== 'ADMIN' || existing.customerId)) throw new Error('기존 고객 계정을 관리자로 전환할 수 없습니다.')
  const passwordHash = await hashPassword('admin')
  await database.client.user.upsert({
    where: { email: 'admin' },
    update: {
      customerId: null,
      passwordHash,
      companyName: 'MRS',
      managerName: '테스트 관리자',
      managerPhone: '000-0000-0000',
      role: 'ADMIN',
      status: 'ACTIVE',
      approvedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
    create: {
      email: 'admin',
      passwordHash,
      companyName: 'MRS',
      managerName: '테스트 관리자',
      managerPhone: '000-0000-0000',
      role: 'ADMIN',
      status: 'ACTIVE',
      approvedAt: new Date(),
    },
  })
  console.info('Test administrator is ready: admin / admin')
} finally {
  await database.close()
}
