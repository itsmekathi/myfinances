import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [StatsController],
})
export class StatsModule {}
