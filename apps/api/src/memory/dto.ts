import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const MEMORY_TYPES = [
  'session',
  'profile',
  'preference',
  'project',
  'decision',
  'document',
  'obsidian',
  'procedure',
  'action_log',
  'task',
];

const VISIBILITIES = ['private', 'shared', 'public'];

export class CreateMemoryDto {
  @IsIn(MEMORY_TYPES)
  type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  source?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: string;

  @IsOptional()
  @IsBoolean()
  canBeUsedAutomatically?: boolean;
}

export class UpdateMemoryDto {
  @IsOptional()
  @IsIn(MEMORY_TYPES)
  type?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: string;

  @IsOptional()
  @IsBoolean()
  canBeUsedAutomatically?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}

export class SearchMemoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  query!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsIn(MEMORY_TYPES)
  type?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}
