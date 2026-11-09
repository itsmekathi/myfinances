import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspaceGuard } from './workspace.guard';

@Module({
  providers: [WorkspacesService, WorkspaceGuard],
  exports: [WorkspacesService, WorkspaceGuard],
})
export class WorkspacesModule {}
