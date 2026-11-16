// Run: pnpm sim:duty [flags]   (see README.md). Acts like the field phone on a duty day.
import { apiUrl, args, databaseUrl, OUT_DIR } from './env';
import { START_COMMAND } from './safety';

const HELP = `Duty Day simulator (acceptance API on port 4300 only). See apps/api/test/tools/duty-sim/README.md.
  --route "lat,lng;*lat,lng;..." | --gpx F | --kml F | --geojson F   (default: built-in Sangli demo)
  --site-index N  --speed 25  --dwell 12  --fence  --gap 20-50  --fake 30  --jump 40  --bad-accuracy 10
  --worker <phone>  --no-setup  --approve-run  --seed N  --api URL
  --base "lat,lng"   the worker's home, saved at setup (default: the first waypoint)
  --live   keep duty open, the last point about now (for the live map)
  --stay  --idle <min>  --quiet <min>   end at the site / stand still / go silent before now
  --name "Ravi"  --manager <phone>   the worker's name and reporting manager
  --stop <minute>:<minutes>   stand still that long from that minute (an unknown stop)
  --missed   also schedule a second site visit today that nobody attends`;

async function apiIsUp(): Promise<boolean> {
  try {
    return (await fetch(`${apiUrl}/health/ready`)).ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (args.help) {
    console.info(HELP);
    return;
  }
  if (!(await apiIsUp())) {
    throw new Error(
      `The acceptance API is not running on ${apiUrl}. Start it (safe env, own database) with:\n  ${START_COMMAND}`,
    );
  }
  console.info(`API ${apiUrl}, database ${new URL(databaseUrl).pathname.slice(1)}`);
  // Loaded after the checks: the acceptance support reads the variables env.ts has set.
  const { resolvePath } = await import('./input.js');
  const { simulate } = await import('./simulate.js');
  const { setup, startDuty } = await import('./setup.js');
  const { newTally, runDay } = await import('./run.js');
  const { report, writeGeoJson } = await import('./report.js');
  const { approveRun } = await import('./approve.js');
  const { acceptanceDb, closeDb } = await import('../../acceptance/support/db.js');
  const { sweepDutyAlerts } = await import('@oneohm/database');

  try {
    const path = await resolvePath(args, OUT_DIR);
    console.info(
      `Path: ${path.source}, ${path.line.length} vertices, site is waypoint ${path.siteIndex}`,
    );
    // Leave a minute of slack so every point is safely in the past.
    const config = {
      speedKmh: args.speed,
      dwellMin: args.dwell,
      seed: args.seed ?? Date.now() % 1e6,
      startMs: 0,
      gap: args.gap,
      fake: args.fake,
      jump: args.jump,
      badAccuracy: args.badAccuracy,
      stay: args.stay,
      idleMin: args.idle,
      stop: args.stop,
    };
    const probe = simulate(path, config);
    // With --quiet the phone went silent that many minutes before now.
    const quietMs = args.quiet * 60_000;
    config.startMs = Date.now() - Math.ceil(probe.totalSec * 1000) - 60_000 - quietMs;
    const sim = simulate(path, config);
    console.info(
      `Trip ${(sim.totalSec / 60).toFixed(1)} min, arrive at minute ${(sim.arriveSec / 60).toFixed(1)}, leave at ${(sim.leaveSec / 60).toFixed(1)}`,
    );

    const world = await setup(args, sim.site, path.waypoints[0] ?? sim.site);
    await startDuty(world, config.startMs);
    const tally = newTally();
    await runDay(world, sim, args, tally);
    if (args.approveRun) await approveRun(world.admin);
    // The five-minute alert job, once, as the worker would run it (Duty Day step 5).
    await sweepDutyAlerts(acceptanceDb().db);
    console.info(`\n${await report(world, tally, sim, args.live)}`);
    console.info(`\nGeoJSON: ${writeGeoJson(OUT_DIR, path, sim)}`);
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
