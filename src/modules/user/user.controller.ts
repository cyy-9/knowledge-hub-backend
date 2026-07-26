import { Controller } from '@nestjs/common';
import { UserService } from './user.service';

/** 用户接口（业务 CRUD 后续再补；登录走 /auth） */
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
}
