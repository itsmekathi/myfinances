import { Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspaceGuard } from './workspace.guard';
import { JoinRequestsController, WorkspacesController } from './workspaces.controller';
import { AdminController, SiteAdminGuard } from '../admin/admin.controller';

@Module({
  controllers: [WorkspacesController, JoinRequestsController, AdminController],
  providers: [WorkspacesService, WorkspaceGuard, SiteAdminGuard],
  exports: [WorkspacesService, WorkspaceGuard],
})
export class WorkspacesModule {}
