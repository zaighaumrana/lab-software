import { IsIn } from 'class-validator';
export class DiscountModeDto {
  @IsIn(['PER_LINE', 'INVOICE_LEVEL'])
  mode!: 'PER_LINE' | 'INVOICE_LEVEL';
}
