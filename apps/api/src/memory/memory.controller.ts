import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { MemoryService } from './memory.service';
import { CreateMemoryDto, SearchMemoryDto, UpdateMemoryDto } from './dto';

@Controller('memory')
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('type') type?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.memory.list(user.id, { type, projectId });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMemoryDto) {
    return this.memory.create(user.id, dto);
  }

  @Post('search')
  search(@CurrentUser() user: AuthUser, @Body() dto: SearchMemoryDto) {
    return this.memory.search(user.id, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    return this.memory.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.memory.remove(user.id, id);
  }
}
