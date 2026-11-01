import { Module } from '@nestjs/common';
import { StateRulesService } from './state-rules.service';
import { StateSupportController } from './state-support.controller';

/** The state's low-income top-up (PRD 3.5): rule versions and the household flag. */
@Module({
  controllers: [StateSupportController],
  providers: [StateRulesService],
})
export class StateSupportModule {}
