import { Module } from '@nestjs/common';
import { TrackController } from './track.controller';

/**
 * The customer's news of a site visit (Duty Day step 6): the public "Track live" page. The
 * messages themselves go from the check-in, check-out and route upload hooks (visit-news-send.ts,
 * visit-news-on-way.ts); the customer's Yes / No tap is answered in the WhatsApp module.
 */
@Module({ controllers: [TrackController] })
export class VisitNewsModule {}
