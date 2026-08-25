import { Test } from '@nestjs/testing';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { SessionGuard } from '../../common/guards/session.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Reflector } from '@nestjs/core';

/**
 * Demonstrates the pattern for testing a controller's RBAC boundary at
 * the actual HTTP layer, without needing a live Postgres connection or
 * a real login flow — copy this shape for any other controller.
 *
 * How it avoids needing a database:
 *  - SessionGuard is entirely overridden (not just mocked) with a stub
 *    that reads a `x-test-role` header and attaches request.user
 *    directly — this replaces "log in for real" with "pretend this
 *    request already has a session for role X," which is the only part
 *    SessionGuard normally needs a database for.
 *  - CatalogService is fully mocked (jest.fn() for every method) —
 *    this test is about the guard/permission layer, not the service's
 *    actual business logic, which belongs in its own unit tests.
 *
 * CatalogController specifically was chosen as the example because it
 * has both kinds of route in one file: CATALOG_VIEW (both active roles
 * have it) and CATALOG_MANAGE (ADMIN only) — see
 * docs/12_RBAC_and_Operator_Dashboard.md.
 */
describe('CatalogController (RBAC integration)', () => {
  let app: INestApplication;
  const catalogService = {
    listTests: jest.fn().mockResolvedValue([]),
    createTest: jest.fn().mockResolvedValue({}),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        { provide: CatalogService, useValue: catalogService },
        PermissionGuard,
        Reflector,
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          const role = req.headers['x-test-role'];
          if (!role) return false; // no test role header = "not logged in"
          req.user = { userId: 'u1', tenantId: 't1', branchId: null, role, fullName: 'Test User', username: 'test' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('LAB_OPERATOR can list tests (CATALOG_VIEW)', async () => {
    await request(app.getHttpServer())
      .get('/catalog/tests')
      .set('x-test-role', 'LAB_OPERATOR')
      .expect(200);
  });

  it('ADMIN can list tests too (CATALOG_VIEW)', async () => {
    await request(app.getHttpServer())
      .get('/catalog/tests')
      .set('x-test-role', 'ADMIN')
      .expect(200);
  });

  it('LAB_OPERATOR is rejected (403) from creating a test — CATALOG_MANAGE is ADMIN-only', async () => {
    await request(app.getHttpServer())
      .post('/catalog/tests')
      .set('x-test-role', 'LAB_OPERATOR')
      .send({ code: 'CBC', name: 'Complete Blood Count', basePrice: 800 })
      .expect(403);
  });

  it('ADMIN can create a test (CATALOG_MANAGE)', async () => {
    await request(app.getHttpServer())
      .post('/catalog/tests')
      .set('x-test-role', 'ADMIN')
      .send({ code: 'CBC', name: 'Complete Blood Count', basePrice: 800 })
      .expect(201);
  });

  it('rejects requests with no test-role header at all (simulating "not logged in") — note this stub returns false rather than throwing, so Nest\'s default guard-rejection status (403) applies here, not the 401 the real SessionGuard would throw by explicitly raising UnauthorizedException', async () => {
    await request(app.getHttpServer()).get('/catalog/tests').expect(403);
  });
});
