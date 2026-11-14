import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ATTACHMENT_LIMITS, type AttachmentDto } from '@myfinances/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import {
  CurrentUser,
  CurrentWorkspace,
  type AuthUser,
  type WorkspaceContext,
} from '../common/request-context';
import { toAttachmentDto } from '../expenses/expense.mapper';
import { sniffMimeType } from './file-type';

@ApiTags('attachments')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId/expenses/:expenseId/attachments')
export class AttachmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ATTACHMENT_LIMITS.maxBytes, files: 1 } }),
  )
  async upload(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthUser,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<AttachmentDto> {
    if (!file) throw new BadRequestException('Attach a file in the "file" field');
    await this.findExpense(ws, expenseId);

    // Trust the file's bytes, not the browser-supplied content type.
    const mimeType = sniffMimeType(file.buffer);
    if (!mimeType || !(ATTACHMENT_LIMITS.mimeTypes as readonly string[]).includes(mimeType)) {
      throw new UnsupportedMediaTypeException('Only JPEG, PNG, WebP, HEIC images and PDFs are allowed');
    }

    const count = await this.prisma.attachment.count({ where: { expenseId } });
    if (count >= ATTACHMENT_LIMITS.maxPerExpense) {
      throw new BadRequestException(`An expense can have at most ${ATTACHMENT_LIMITS.maxPerExpense} attachments`);
    }

    const storageKey = await this.storage.save(file.buffer, mimeType);
    try {
      const created = await this.prisma.attachment.create({
        data: {
          expenseId,
          workspaceId: ws.workspaceId,
          uploadedById: user.userId,
          fileName: sanitizeFileName(file.originalname),
          mimeType,
          sizeBytes: file.size,
          storageKey,
        },
        include: { uploadedBy: { select: { id: true, displayName: true } } },
      });
      return toAttachmentDto(created);
    } catch (e) {
      await this.storage.remove(storageKey);
      throw e;
    }
  }

  @Get(':id')
  async download(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const att = await this.findAttachment(ws, expenseId, id);
    const body = await this.storage.open(att.storageKey);
    // e.g. uploaded before attachments moved off the ephemeral disk.
    if (!body) throw new NotFoundException('Attachment file is missing');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(body, {
      type: att.mimeType,
      length: att.sizeBytes,
      disposition: `inline; filename="${asciiFallback(att.fileName)}"; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const att = await this.findAttachment(ws, expenseId, id);
    await this.prisma.attachment.delete({ where: { id: att.id } });
    await this.storage.remove(att.storageKey);
  }

  private async findExpense(ws: WorkspaceContext, expenseId: string) {
    const exp = await this.prisma.expense.findFirst({
      where: { id: expenseId, workspaceId: ws.workspaceId },
      select: { id: true },
    });
    if (!exp) throw new NotFoundException('Expense not found');
  }

  private async findAttachment(ws: WorkspaceContext, expenseId: string, id: string) {
    const att = await this.prisma.attachment.findFirst({
      where: { id, expenseId, workspaceId: ws.workspaceId },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    return att;
  }
}

function sanitizeFileName(name: string): string {
  // multer decodes names as latin1; re-decode as UTF-8 so non-English names survive.
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  const cleaned = decoded.replace(/[\\/\x00-\x1f\x7f"]/g, '_').trim();
  return (cleaned || 'file').slice(0, 200);
}

function asciiFallback(name: string): string {
  return name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '_');
}
