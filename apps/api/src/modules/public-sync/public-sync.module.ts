import { Module } from '@nestjs/common';
import { PublicSyncController } from './public-sync.controller';
import { PublicSyncService } from './public-sync.service';
import { PublicSyncDispatcher } from './public-sync.dispatcher';
import { PUBLIC_SYNC_TRANSPORT, UnconfiguredPublicSyncTransport } from './public-sync.transport';
@Module({ controllers: [PublicSyncController], providers: [PublicSyncService, PublicSyncDispatcher,
  { provide: PUBLIC_SYNC_TRANSPORT, useClass: UnconfiguredPublicSyncTransport }] })
export class PublicSyncModule {}
