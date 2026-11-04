import { Inject, Injectable } from '@nestjs/common';
import type { ApprovalItem } from '@oneohm/api-contracts';
import { listPendingApprovals, readBusinessSetting } from '@oneohm/database';
import { approvalOverdue, mayDecide } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import type { Actor } from '../../common/auth/actor';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { loadPointsAuthority } from '../workforce/points-authority';
import { approvalHref } from './approval-links';

/**
 * "Waiting for my approval" (PRD 7.1): everything across OneOhm this person may decide
 * (their rights, the money limits in Settings, a task's own reviewers), never their
 * own requests, oldest first.
 */
@Injectable()
export class ApprovalsInboxService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {}

  async mine(actor: Actor): Promise<ApprovalItem[]> {
    const [pending, policy, points] = await Promise.all([
      listPendingApprovals(this.db),
      readBusinessSetting(this.db, 'approvals'),
      loadPointsAuthority(this.db, actor),
    ]);
    const who = { userId: actor.userId, capabilities: [...actor.capabilities] };
    const today = todayIn(this.env.BUSINESS_TIMEZONE);
    return (
      pending
        .filter((item) => mayDecide(item, who, policy))
        // Points: only someone above the earner, or a Super Admin (never their own).
        .filter(
          (item) =>
            item.kind !== 'points' || points.may(actor.userId, item.requestedByUserId ?? ''),
        )
        .map((item) => ({
          kind: item.kind,
          id: item.id,
          subject: item.subject,
          requesterName: item.requesterName,
          requestedAt: item.requestedAt,
          amountPaise: item.amountPaise,
          projectCode: item.projectCode,
          href: approvalHref(item),
          overdue: approvalOverdue(
            todayIn(this.env.BUSINESS_TIMEZONE, new Date(item.requestedAt)),
            today,
            policy,
          ),
        }))
    );
  }
}
