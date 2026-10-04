import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { readAdminApiToken } from '../config/admin-api-token';

@Injectable()
export class AdminAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.ADMIN_API_ENABLED !== 'true') {
      throw new NotFoundException();
    }

    const expectedToken = readAdminApiToken();
    const authorization = context.switchToHttp().getRequest().headers.authorization;
    if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
