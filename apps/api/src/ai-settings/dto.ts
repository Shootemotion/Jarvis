import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsIn(['auto', 'anthropic', 'openai'])
  preferredProvider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  // Pass '' to clear a stored key; omit to leave unchanged.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  anthropicKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  openaiKey?: string;
}
