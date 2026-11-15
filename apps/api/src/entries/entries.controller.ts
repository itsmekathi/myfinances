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
  type Type,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createEntrySchema,
  listEntriesQuerySchema,
  updateEntrySchema,
  type ClientInfoDto,
  type CreateEntryData,
  type EntryDto,
  type EntryKind,
  type ListEntriesQuery,
  type Paginated,
  type UpdateEntryData,
} from '@myfinances/shared';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import {
  CurrentUser,
  CurrentWorkspace,
  type AuthUser,
  type WorkspaceContext,
} from '../common/request-context';
import { ClientInfo } from '../common/client-info';
import { EntriesService } from './entries.service';

/** Builds the CRUD controller for one entry kind, served at `workspaces/:workspaceId/<path>`. */
function entriesController(kind: EntryKind, path: string, name: string): Type<unknown> {
  @ApiTags(path)
  @ApiBearerAuth()
  @UseGuards(WorkspaceGuard)
  @Controller(`workspaces/:workspaceId/${path}`)
  class EntriesController {
    constructor(readonly entries: EntriesService) {}

    @Get()
    list(
      @CurrentWorkspace() ws: WorkspaceContext,
      @Query({ schema: listEntriesQuerySchema }) query: ListEntriesQuery,
    ): Promise<Paginated<EntryDto>> {
      return this.entries.list(ws, kind, query);
    }

    @Get(':id')
    get(@CurrentWorkspace() ws: WorkspaceContext, @Param('id', ParseUUIDPipe) id: string): Promise<EntryDto> {
      return this.entries.get(ws, kind, id);
    }

    @Post()
    create(
      @CurrentWorkspace() ws: WorkspaceContext,
      @CurrentUser() user: AuthUser,
      @ClientInfo() client: ClientInfoDto,
      @Body({ schema: createEntrySchema }) body: CreateEntryData,
    ): Promise<EntryDto> {
      return this.entries.create(ws, kind, user.userId, body, client);
    }

    @Patch(':id')
    update(
      @CurrentWorkspace() ws: WorkspaceContext,
      @CurrentUser() user: AuthUser,
      @ClientInfo() client: ClientInfoDto,
      @Param('id', ParseUUIDPipe) id: string,
      @Body({ schema: updateEntrySchema }) body: UpdateEntryData,
    ): Promise<EntryDto> {
      return this.entries.update(ws, kind, id, user.userId, body, client);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(@CurrentWorkspace() ws: WorkspaceContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
      return this.entries.remove(ws, kind, id);
    }
  }
  // Distinct class names keep Nest's logs and Swagger operation ids apart.
  Object.defineProperty(EntriesController, 'name', { value: name });
  return EntriesController;
}

export const IncomeController = entriesController('income', 'income', 'IncomeController');
export const InvestmentsController = entriesController('investment', 'investments', 'InvestmentsController');
