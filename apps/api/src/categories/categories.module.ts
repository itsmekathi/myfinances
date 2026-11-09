import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [WorkspacesModule],
  controllers: [CategoriesController],
})
export class CategoriesModule {}
