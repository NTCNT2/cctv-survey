import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput,
  type AuthUser,
  type User,
} from '@cctv/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

/** Admin-only user management. Users are deactivated, never deleted. */
@Controller('users')
@RequirePermission('user:manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<User[]> {
    return this.users.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.users.get(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ): Promise<User> {
    return this.users.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<User> {
    return this.users.update(id, body, actor.id);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.users.resetPassword(id, body, actor.id);
  }
}
