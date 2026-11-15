import type { LeaveImpact, LeaveRequestRecord, ProjectTask } from '@oneohm/api-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session } from '../support/http';
import { type OwnPerson, ownPerson, retire } from '../support/people';
import { addDays, type Sale, sellProject, today } from '../support/sales';
import { project, taskByKey } from '../support/tasks';
import { staffEmail, TEAM_PASSWORD } from '../support/team';

// PRD 13 "Leave": project impact and handover are handled before ordinary leave approval.
// The people here belong to this scenario, so the standing team never goes on leave.
describe('Leave', () => {
  let admin: Session;
  let hr: Session;
  let away: OwnPerson;
  let cover: OwnPerson;
  let free: OwnPerson;
  let awaySession: Session;
  let sale: Sale;
  let work: ProjectTask[];
  let request: LeaveRequestRecord;
  const window = {
    leaveType: 'casual',
    fromDate: addDays(today(), 1),
    toDate: addDays(today(), 3),
    halfDay: false,
  };

  beforeAll(async () => {
    admin = await Session.admin();
    hr = await Session.password(staffEmail('hr'), TEAM_PASSWORD);
    away = await ownPerson(admin, 'Leena Away (test)');
    cover = await ownPerson(admin, 'Kunal Cover (test)');
    free = await ownPerson(admin, 'Farah Free (test)');
    sale = await sellProject(admin, { name: 'Leave Impact Customer (test)' });
    const detail = await project(admin, sale.project.id);
    work = [taskByKey(detail, 'electricity_details'), taskByKey(detail, 'site_survey')];
    for (const task of work) await admin.post(`/tasks/${task.id}/assign`, { userId: away.id });
    awaySession = await Session.code(away.phone);
  });
  afterAll(async () => {
    await retire(admin, [away, cover, free]);
  });

  it('shows the person the work their leave touches before they apply', async () => {
    const impact = await awaySession.post<LeaveImpact>('/leave/impact', window);
    expect(impact.halfDays).toBeGreaterThan(0);
    expect(impact.balanceAfterHalfDays).toBeGreaterThanOrEqual(0);
    expect(impact.tasks.map((task) => task.id)).toEqual(
      expect.arrayContaining(work.map((task) => task.id)),
    );
    expect(impact.projectCodes).toContain(sale.project.code);
    // Who could cover is suggested from people who do this kind of work.
    expect(impact.backups.length).toBeGreaterThan(0);
  });

  it('keeps ordinary leave with open work pending until someone covers it', async () => {
    request = await awaySession.post<LeaveRequestRecord>('/leave', {
      ...window,
      reason: 'Family function (test)',
    });
    expect(request.status).toBe('pending');

    const forApprover = await hr.get<LeaveImpact>(`/leave/${request.id}/impact`);
    expect(forApprover.tasks.map((task) => task.id)).toEqual(
      expect.arrayContaining(work.map((task) => task.id)),
    );

    const refused = await hr.raw('POST', `/leave/${request.id}/decide`, { approve: true });
    expect(refused.status).toBe(400);
    expect(refused.text).toMatch(/pick who covers/i);
    const list = await hr.get<LeaveRequestRecord[]>('/leave');
    expect(list.find((row) => row.id === request.id)?.status).toBe('pending');
    // Ordinary leave cannot skip the handover the way emergency leave may.
    const skipped = await hr.raw('POST', `/leave/${request.id}/decide`, {
      approve: true,
      skipHandover: true,
    });
    expect(skipped.status).toBe(400);
  });

  it('does not let anyone approve their own leave', async () => {
    const own = await awaySession.raw('POST', `/leave/${request.id}/decide`, {
      approve: true,
      backupUserId: cover.id,
    });
    expect([403, 409]).toContain(own.status);
  });

  it('asks the backup, who must say yes before the work moves', async () => {
    const coverSession = await Session.code(cover.phone);
    // The approver cannot hand the work to someone who was never asked.
    const forced = await hr.raw('POST', `/leave/${request.id}/decide`, {
      approve: true,
      backupUserId: cover.id,
    });
    expect(forced.status).toBe(400);
    expect(forced.text).toMatch(/ask them to cover first/i);

    const asked = await hr.post<LeaveRequestRecord>(`/leave/${request.id}/backup`, {
      backupUserId: cover.id,
    });
    expect(asked.backup?.id).toBe(cover.id);
    expect(asked.coverAnswer).toBe('asked');
    const mine = await coverSession.get<LeaveRequestRecord[]>('/leave/covering');
    expect(mine.map((row) => row.id)).toContain(request.id);

    const waiting = await hr.raw('POST', `/leave/${request.id}/decide`, { approve: true });
    expect(waiting.status).toBe(400);
    expect(waiting.text).toMatch(/not answered yet/i);

    // Only the backup answers, and a no needs a reason.
    const notThem = await hr.raw('POST', `/leave/${request.id}/cover`, { accept: true });
    expect(notThem.status).toBe(404);
    const bare = await coverSession.raw('POST', `/leave/${request.id}/cover`, { accept: false });
    expect(bare.status).toBe(400);
    const declined = await coverSession.post<LeaveRequestRecord>(`/leave/${request.id}/cover`, {
      accept: false,
      note: 'Site visits all week (test)',
    });
    expect(declined.coverAnswer).toBe('declined');
    const seen = await awaySession.get<LeaveRequestRecord[]>('/leave/mine');
    expect(seen.find((row) => row.id === request.id)?.coverNote).toBe(
      'Site visits all week (test)',
    );
    const afterNo = await hr.raw('POST', `/leave/${request.id}/decide`, { approve: true });
    expect(afterNo.status).toBe(400);
    expect(afterNo.text).toMatch(/declined/i);

    // Asked again (plans changed), they say yes.
    await awaySession.post(`/leave/${request.id}/backup`, { backupUserId: cover.id });
    const accepted = await coverSession.post<LeaveRequestRecord>(`/leave/${request.id}/cover`, {
      accept: true,
      note: 'Moved my visits (test)',
    });
    expect(accepted.coverAnswer).toBe('accepted');
    const twice = await coverSession.raw('POST', `/leave/${request.id}/cover`, {
      accept: false,
      note: 'x',
    });
    expect(twice.status).toBe(409);

    // Swapping in someone else at approval is refused too.
    const swapped = await hr.raw('POST', `/leave/${request.id}/decide`, {
      approve: true,
      backupUserId: free.id,
    });
    expect(swapped.status).toBe(400);
  });

  it('hands the work to the backup who accepted when the leave is approved', async () => {
    const approved = await hr.post<LeaveRequestRecord>(`/leave/${request.id}/decide`, {
      approve: true,
      note: 'Kunal covers the survey and the bill check (test)',
    });
    expect(approved.status).toBe('approved');
    expect(approved.backup?.id).toBe(cover.id);
    expect(approved.coverAnswer).toBe('accepted');
    expect(approved.tasksHandedOver).toBe(work.length);

    const detail = await project(admin, sale.project.id);
    for (const task of work) {
      expect(taskByKey(detail, task.templateKey).assignee?.id).toBe(cover.id);
    }
  });

  it('approves leave that touches no work without a backup', async () => {
    const freeSession = await Session.code(free.phone);
    const impact = await freeSession.post<LeaveImpact>('/leave/impact', window);
    expect(impact.tasks).toHaveLength(0);
    const asked = await freeSession.post<LeaveRequestRecord>('/leave', window);
    // Not approving needs a reason the person can read.
    const bare = await hr.raw('POST', `/leave/${asked.id}/decide`, { approve: false });
    expect(bare.status).toBe(400);
    const approved = await hr.post<LeaveRequestRecord>(`/leave/${asked.id}/decide`, {
      approve: true,
    });
    expect(approved.status).toBe('approved');
    expect(approved.tasksHandedOver).toBe(0);
  });
});
