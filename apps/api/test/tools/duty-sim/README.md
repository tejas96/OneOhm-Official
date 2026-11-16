# Duty Day simulator

Acts like the field phone on a duty day, against the **acceptance** API (port 4300) and its
database `oneohm_acceptance` only. It accepts only localhost or 127.0.0.1 on port 4300 (never 4200) and only that database. Nothing real is
sent (the acceptance API logs WhatsApp and uses sandbox payments).

Start the API first (once; it stays up with `--keep`, stop it with `pnpm test:acceptance --stop`):

    pnpm test:acceptance 87-duty-day-auto-site-visits --keep

Then run, from the repo root (`pnpm sim:duty --help` lists every flag):

    # 1. The built-in Sangli demo path (no network), clean day, with the phone's fence events
    pnpm sim:duty --fence

    # 2. A custom route; the * marks the job site (road geometry from the public OSRM demo server,
    #    only the coordinates are sent; the answer is cached in out/). Or use --gpx/--kml/--geojson.
    pnpm sim:duty --route "16.8365,74.5655;*16.8524,74.5815;16.8575,74.6015" --speed 30 --dwell 20 --approve-run

    # 3. A problem day: no points for minutes 20-50, one fake (mock) point at minute 30
    pnpm sim:duty --gap 20-50 --fake 30

Other flags: `--site-index N`, `--jump <min>` (one point 20 km away), `--bad-accuracy <min>`,
`--worker <phone>` (reuse a worker), `--no-setup` (no new project), `--seed N` (repeat a run),
`--base "lat,lng"` (the worker's home, saved at setup; default the first waypoint; travel is paid from where duty starts, and a start far from the base and every office is flagged `far_from_base`), `--approve-run` (runs the morning auto-approve job for the day, then restores Settings).

For the manager's live map (Duty Day step 4), `--live` keeps duty open and times the trip so
the last point is about a minute old (no claim report). `--stay` ends the trip at the site (an
open visit, with `--fence`), `--idle <min>` stands still after the trip, `--quiet <min>` ends
the trip that many minutes before now (a gap), `--name "Ravi"` names the worker and
`--manager <phone>` sets their reporting manager:

    pnpm sim:duty --live --name "Ravi" --manager +919812345678
    pnpm sim:duty --live --name "Sunita" --site-index 2 --stay --fence --dwell 30

Each run makes a worker `Sim Worker <time>`, a sold project, assigns the site survey, pins the
property at the site and schedules the task today; starts duty at now minus the trip time, posts
points like the phone (every 120 s or 100 m, GPS noise, batches of 200), ends duty, and prints the
route, site visits, travel day and claim. The points are also written to `out/*.geojson` (open on
geojson.io; git-ignored). One duty day per worker per date: use a new worker to run again.
