import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createExpenseSchema,
  listExpensesQuerySchema,
  updateExpenseSchema,
  type ClientInfoDto,
  type CreateExpenseData,
  type ExpenseDetailDto,
  type ExpenseDto,
  type ListExpensesQuery,
  type Paginated,
  type UpdateExpenseData,
} from '@myfinances/shared';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import {
  CurrentUser,
  CurrentWorkspace,
  type AuthUser,
  type WorkspaceContext,
} from '../common/request-context';
import { ClientInfo } from '../common/client-info';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId/expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Query({ schema: listExpensesQuerySchema }) query: ListExpensesQuery,
  ): Promise<Paginated<ExpenseDto>> {
    return this.expenses.list(ws, query);
  }

  @Get(':id')
  get(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExpenseDetailDto> {
    return this.expenses.get(ws, id);
  }

  @Post()
  create(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @ClientInfo() client: ClientInfoDto,
    @Body({ schema: createExpenseSchema }) body: CreateExpenseData,
  ): Promise<ExpenseDetailDto> {
    return this.expenses.create(ws, user.userId, body, client);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @ClientInfo() client: ClientInfoDto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateExpenseSchema }) body: UpdateExpenseData,
  ): Promise<ExpenseDetailDto> {
    return this.expenses.update(ws, id, user.userId, body, client);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.expenses.remove(ws, id);
  }
}
