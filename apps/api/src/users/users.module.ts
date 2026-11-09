import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { MeController } from './me.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  providers: [UsersService],
  controllers: [MeController],
  exports: [UsersService],
})
export class UsersModule {}
