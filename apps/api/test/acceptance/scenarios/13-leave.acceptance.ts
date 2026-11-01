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

  it('hands the work to the backup when the leave is approved', async () => {
    const approved = await hr.post<LeaveRequestRecord>(`/leave/${request.id}/decide`, {
      approve: true,
      backupUserId: cover.id,
      note: 'Kunal covers the survey and the bill check (test)',
    });
    expect(approved.status).toBe('approved');
    expect(approved.backup?.id).toBe(cover.id);
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
    const approved = await hr.post<LeaveRequestRecord>(`/leave/${asked.id}/decide`, {
      approve: true,
    });
    expect(approved.status).toBe('approved');
    expect(approved.tasksHandedOver).toBe(0);
  });
});
