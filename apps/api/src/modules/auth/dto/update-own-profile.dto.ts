import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

/**
 * Self-service "edit my own profile" — deliberately has NO `role` field
 * at all, not a role field that's merely ignored. This is the actual
 * lock on the role, not the frontend disabling an input: even a request
 * built by hand against this endpoint has no way to change role, because
 * the DTO the server accepts doesn't define one to change.
 *
 * Changing the password requires the current password — this is the
 * standard "prove you're still you" check before letting a session
 * change its own credentials, same principle as most account-settings
 * flows.
 */
export class UpdateOwnProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ValidateIf((o) => !!o.currentPassword || !!o.newPassword)
  @IsString()
  @MinLength(4)
  newPassword?: string;
}
