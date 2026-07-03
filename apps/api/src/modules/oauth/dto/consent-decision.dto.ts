import { IsArray, IsIn, IsString } from 'class-validator';

import { MCP_SCOPES } from '../../mcp/mcp-token';

export const APPROVABLE_SCOPES = [
  MCP_SCOPES.READ,
  MCP_SCOPES.WRITE,
  MCP_SCOPES.SHARE,
  'offline_access',
] as const;

export class ConsentDecisionDto {
  @IsArray()
  @IsString({ each: true })
  @IsIn([...APPROVABLE_SCOPES], { each: true })
  approvedScopes!: string[];
}
