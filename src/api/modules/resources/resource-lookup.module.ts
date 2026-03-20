import { Module } from '@nestjs/common';
import { ResourceLookupService } from './resource-lookup.service.js';

@Module({
  providers: [ResourceLookupService],
  exports: [ResourceLookupService],
})
export class ResourceLookupModule {}
