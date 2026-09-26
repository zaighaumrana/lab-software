import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class SaveSmsTemplateDto {
  @IsString()
  @MaxLength(500)
  body!: string;

  @IsBoolean()
  isActive!: boolean;

  /** Approved SENDPK template_id to map this event to, or null/omitted to unmap. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sendpkTemplateId?: string | null;
}
