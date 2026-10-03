import { Test } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('Prisma singleton lifecycle', () => {
  it('shares one provider and connects/disconnects exactly once', async () => {
    const keys=['RUNTIME_DATABASE_URL','DB_RUNTIME_MODE','NODE_ENV'] as const;
    const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    process.env.RUNTIME_DATABASE_URL = 'postgresql://localhost/fixture';
    process.env.DB_RUNTIME_MODE='development';process.env.NODE_ENV='test';
    const connect = jest.spyOn(PrismaService.prototype, '$connect').mockResolvedValue(undefined);
    const disconnect = jest.spyOn(PrismaService.prototype, '$disconnect').mockResolvedValue(undefined);
    try {
      const module = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
      const first = module.get(PrismaService);
      expect(module.get(PrismaService)).toBe(first);
      await module.init();
      expect(connect).toHaveBeenCalledTimes(1);
      await module.close();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      connect.mockRestore();
      disconnect.mockRestore();
      for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
    }
  });
});
