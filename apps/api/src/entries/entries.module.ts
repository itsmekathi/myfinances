import { Module } from '@nestjs/common';
import { IncomeController, InvestmentsController } from './entries.controller';
import { EntriesService } from './entries.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [IncomeController, InvestmentsController],
  providers: [EntriesService],
})
export class EntriesModule {}
