import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { RolesService } from './roles.service';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  controllers: [PeopleController, SkillsController],
  providers: [PeopleService, RolesService, SkillsService],
})
export class PeopleModule {}
