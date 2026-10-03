import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, assertRuntimePrivileges, hardenedRuntime } from '@lms/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    if (hardenedRuntime()) {
      const schema=new URL(process.env.RUNTIME_DATABASE_URL!).searchParams.get('schema') ?? 'public';
      try { await assertRuntimePrivileges(this,schema); }
      catch (error) { await this.$disconnect(); throw error; }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
