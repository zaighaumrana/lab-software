import { Test } from '@nestjs/testing';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('Prisma singleton lifecycle', () => {
  it('shares one provider and connects/disconnects exactly once', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://localhost/fixture';
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
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});
