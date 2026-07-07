import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const TASK_TYPES = [
  'simple_chat',
  'document_analysis',
  'coding',
  'long_reasoning',
  'fast_summary',
  'complex_analysis',
  'memory_question',
];

export class ChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16000)
  message!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsIn(TASK_TYPES)
  taskType?: string;
}
