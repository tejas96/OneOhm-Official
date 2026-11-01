import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';

/** One search over every record a person may open (PRD 10). */
@Module({ controllers: [SearchController] })
export class SearchModule {}
