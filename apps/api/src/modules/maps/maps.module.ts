import { Module } from '@nestjs/common';
import { MapsController } from './maps.controller';

/** Map settings the web reads at run time (no key is baked into the web build). */
@Module({ controllers: [MapsController] })
export class MapsModule {}
