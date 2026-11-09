import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createCategorySchema,
  updateCategorySchema,
  type CategoryDto,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@myfinances/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, type Category } from '../generated/prisma/client';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { CurrentWorkspace, type WorkspaceContext } from '../common/request-context';

const toDto = (c: Category): CategoryDto => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
  color: c.color,
  parentId: c.parentId,
});

/**
 * Categories are two levels deep: top-level categories and their subcategories.
 * The list endpoint returns a flat list; clients nest it with buildCategoryTree().
 */
@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId/categories')
export class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentWorkspace() ws: WorkspaceContext): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: { workspaceId: ws.workspaceId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toDto);
  }

  @Post()
  async create(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body({ schema: createCategorySchema }) body: CreateCategoryInput,
  ): Promise<CategoryDto> {
    const parent = body.parentId ? await this.findOrThrow(ws.workspaceId, body.parentId) : null;
    if (parent?.parentId) throw new BadRequestException('Subcategories cannot have their own subcategories');
    await this.assertNameFree(ws.workspaceId, body.parentId ?? null, body.name);

    return this.handleUnique(async () =>
      toDto(
        await this.prisma.category.create({
          data: {
            workspaceId: ws.workspaceId,
            name: body.name,
            icon: body.icon,
            // Subcategories inherit the parent's colour unless one is given.
            color: body.color ?? parent?.color,
            parentId: body.parentId ?? null,
          },
        }),
      ),
    );
  }

  @Patch(':id')
  async update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateCategorySchema }) body: UpdateCategoryInput,
  ): Promise<CategoryDto> {
    const existing = await this.findOrThrow(ws.workspaceId, id);
    if (body.parentId !== undefined && body.parentId !== existing.parentId) {
      throw new BadRequestException('Moving a category to another parent is not supported');
    }
    if (body.name && body.name !== existing.name) {
      await this.assertNameFree(ws.workspaceId, existing.parentId, body.name, id);
    }
    return this.handleUnique(async () =>
      toDto(
        await this.prisma.category.update({
          where: { id },
          data: { name: body.name, icon: body.icon, color: body.color },
        }),
      ),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.findOrThrow(ws.workspaceId, id);
    // Deleting a category also deletes its subcategories.
    // Affected expenses keep their amounts but lose the category (onDelete: SetNull).
    await this.prisma.$transaction([
      this.prisma.category.deleteMany({ where: { parentId: id, workspaceId: ws.workspaceId } }),
      this.prisma.category.delete({ where: { id } }),
    ]);
  }

  private async findOrThrow(workspaceId: string, id: string) {
    const found = await this.prisma.category.findFirst({ where: { id, workspaceId } });
    if (!found) throw new NotFoundException('Category not found');
    return found;
  }

  /** The DB unique index can't catch duplicate top-level names (NULL parentIds are distinct). */
  private async assertNameFree(workspaceId: string, parentId: string | null, name: string, exceptId?: string) {
    const clash = await this.prisma.category.findFirst({
      where: {
        workspaceId,
        parentId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('A category with this name already exists here');
  }

  private async handleUnique<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A category with this name already exists here');
      }
      throw e;
    }
  }
}
