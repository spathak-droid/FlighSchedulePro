import { Module } from '@nestjs/common';
import { DirectoryController } from './directory.controller.js';
import { DirectoryService } from './directory.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [DirectoryController],
  providers: [DirectoryService],
  exports: [DirectoryService],
})
export class DirectoryModule {}
