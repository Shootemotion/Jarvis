import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  /** Upload .md/.txt files or a .zip of an Obsidian vault (field name: "files"). */
  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 50, { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFiles()
    files: { originalname: string; buffer: Buffer; mimetype: string; size: number }[],
    @Body() body: { projectId?: string; excludedFolders?: string; allowListFolders?: string },
  ) {
    if (!files?.length) throw new BadRequestException('No se subió ningún archivo.');
    const csv = (v?: string) =>
      v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    return this.knowledge.ingest(user.id, files, {
      projectId: body.projectId || undefined,
      excludedFolders: csv(body.excludedFolders),
      allowListFolders: csv(body.allowListFolders),
    });
  }

  @Get('documents')
  documents(@CurrentUser() user: AuthUser) {
    return this.knowledge.list(user.id);
  }

  @Delete('documents/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.knowledge.remove(user.id, id);
  }

  @Post('search')
  search(
    @CurrentUser() user: AuthUser,
    @Body() body: { query: string; projectId?: string },
  ) {
    if (!body?.query?.trim()) throw new BadRequestException('Falta "query".');
    return this.knowledge.search(user.id, body.query, body.projectId);
  }
}
