import { Module } from '@nestjs/common';
import { BankingController } from './banking.controller';

/** Looks up the bank branch behind an IFSC while bank details are typed in. */
@Module({ controllers: [BankingController] })
export class BankingModule {}
