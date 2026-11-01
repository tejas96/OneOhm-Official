import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { RolesService } from './roles.service';

@Module({ controllers: [PeopleController], providers: [PeopleService, RolesService] })
export class PeopleModule {}
