import { Module } from '@nestjs/common';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { AutonomousMemoryService } from './autonomous-memory.service';

@Module({
  controllers: [MemoryController],
  providers: [MemoryService, AutonomousMemoryService],
  exports: [MemoryService, AutonomousMemoryService],
})
export class MemoryModule {}
