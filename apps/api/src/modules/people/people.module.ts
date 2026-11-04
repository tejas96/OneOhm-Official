import { Module } from '@nestjs/common';
import { DepartureService } from './departure/departure.service';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { PersonInvites } from './person-invite';
import { RolesService } from './roles.service';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  controllers: [PeopleController, SkillsController],
  providers: [DepartureService, PeopleService, PersonInvites, RolesService, SkillsService],
})
export class PeopleModule {}
