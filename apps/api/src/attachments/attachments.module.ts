import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [AttachmentsController],
})
export class AttachmentsModule {}
