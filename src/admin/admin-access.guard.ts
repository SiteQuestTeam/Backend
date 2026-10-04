import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AdminAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.ADMIN_API_ENABLED !== 'true') {
      throw new NotFoundException();
    }

    const expectedToken = process.env.ADMIN_API_TOKEN;
    const authorization = context.switchToHttp().getRequest().headers.authorization;
    if (!expectedToken || authorization !== `Bearer ${expectedToken}`) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
